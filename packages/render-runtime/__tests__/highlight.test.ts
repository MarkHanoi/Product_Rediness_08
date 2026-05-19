// Highlight + SelectionHighlightCommitter tests (S16 D3, 3 cases).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { CommitterHost, bindStore } from '@pryzm/scene-committer';
import { SelectionStore, type SelectionKind } from '@pryzm/stores';
import { buildEdgeOutline, disposeEdgeOutline } from '../src/highlight.js';
import {
  SelectionHighlightCommitter,
  type HighlightProvider,
  type HighlightProviderRegistry,
} from '../src/SelectionHighlightCommitter.js';

const ALL_12_KINDS: readonly SelectionKind[] = [
  'wall', 'slab', 'door', 'window', 'roof', 'curtainWall',
  'grid', 'column', 'beam', 'stair', 'handrail', 'ceiling',
];

interface FakeElement {
  group: THREE.Group;
  geometry: THREE.BufferGeometry;
}

function makeFakeElement(): FakeElement {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  group.add(mesh);
  return { group, geometry };
}

function buildRegistry(elements: Map<string, FakeElement>, kinds: readonly SelectionKind[]): {
  registry: HighlightProviderRegistry;
} {
  const map = new Map<SelectionKind, HighlightProvider>();
  for (const kind of kinds) {
    map.set(kind, {
      parentFor: (id) => elements.get(id)?.group ?? null,
      geometryFor: (id) => elements.get(id)?.geometry ?? null,
    });
  }
  return { registry: map };
}

describe('SelectionHighlightCommitter (S16 D3)', () => {
  it('attaches an outline LineSegments under the provider parent on selection-add', async () => {
    const host = new CommitterHost();
    const elements = new Map<string, FakeElement>();
    const el = makeFakeElement();
    elements.set('wall-1', el);
    const { registry } = buildRegistry(elements, ['wall']);
    host.register(new SelectionHighlightCommitter(registry));

    const sel = new SelectionStore();
    const handle = bindStore(sel, 'selection', host);
    sel.select([{ id: 'wall-1', kind: 'wall' }]);
    await handle.flush();

    // Outline should be a LineSegments child of the fake element's group.
    const outlines = el.group.children.filter((c) => c instanceof THREE.LineSegments);
    expect(outlines).toHaveLength(1);
    const outline = outlines[0]! as THREE.LineSegments;
    expect(outline.geometry).toBeInstanceOf(THREE.EdgesGeometry);
    handle.dispose();
  });

  it('removes the outline on deselect (symmetric add/remove)', async () => {
    const host = new CommitterHost();
    const elements = new Map<string, FakeElement>();
    const el = makeFakeElement();
    elements.set('wall-1', el);
    const { registry } = buildRegistry(elements, ['wall']);
    host.register(new SelectionHighlightCommitter(registry));

    const sel = new SelectionStore();
    const handle = bindStore(sel, 'selection', host);
    sel.select([{ id: 'wall-1', kind: 'wall' }]);
    await handle.flush();
    sel.deselect(['wall-1']);
    await handle.flush();

    const outlines = el.group.children.filter((c) => c instanceof THREE.LineSegments);
    expect(outlines).toHaveLength(0);
    handle.dispose();
  });

  it('renders an outline for every one of the 12 element kinds (M9 cross-element gate)', async () => {
    const host = new CommitterHost();
    const elements = new Map<string, FakeElement>();
    for (const kind of ALL_12_KINDS) {
      elements.set(`${kind}-1`, makeFakeElement());
    }
    const { registry } = buildRegistry(elements, ALL_12_KINDS);
    host.register(new SelectionHighlightCommitter(registry));

    const sel = new SelectionStore();
    const handle = bindStore(sel, 'selection', host);
    sel.select(ALL_12_KINDS.map((kind) => ({ id: `${kind}-1`, kind })));
    await handle.flush();

    for (const kind of ALL_12_KINDS) {
      const el = elements.get(`${kind}-1`)!;
      const outlines = el.group.children.filter((c) => c instanceof THREE.LineSegments);
      expect(outlines, `kind=${kind} should have an outline`).toHaveLength(1);
    }
    handle.dispose();
  });

  it('buildEdgeOutline + disposeEdgeOutline are symmetric (no leaks)', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const lines = buildEdgeOutline(geo);
    expect(lines).toBeInstanceOf(THREE.LineSegments);
    expect(lines.geometry).toBeInstanceOf(THREE.EdgesGeometry);
    // Attach to a parent so dispose's "remove from parent" branch executes.
    const parent = new THREE.Group();
    parent.add(lines);
    expect(parent.children).toContain(lines);
    disposeEdgeOutline(lines);
    expect(parent.children).not.toContain(lines);
    // Idempotent — second dispose must not throw.
    disposeEdgeOutline(lines);
    geo.dispose();
  });
});
