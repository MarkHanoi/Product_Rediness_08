/**
 * §FIX-RBL-IDONLY-EVENT-NO-RENDER (L-172) — regression test.
 *
 * The F.events.17 catalog contract for `bim-room-bounding-line-added/updated`
 * is `{ id }`-ONLY (packages/event-bus/src/catalog.ts). The store persists the
 * FULL record (with a valid `placement`). The initBuilders handler must resolve
 * id → full record via roomBoundingLineStore.get(id) BEFORE calling
 * builder.build(); otherwise the builder receives an `{id}`-only object, sees no
 * placement.start/end, and §RBL-PLACEMENT-GUARD skips every line — so the dashed
 * room-bounding lines never render for ANY typology.
 *
 * This pins:
 *   (a) the BUG — feeding the raw `{id}`-only event detail into build() skips
 *       (no mesh produced), reproducing the latent no-render defect;
 *   (b) the FIX — resolving id → full record from the store yields a buildable
 *       record with FINITE start/end (guard passes) and produces a line mesh.
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { RoomBoundingLineStore } from '@pryzm/core-app-model/stores';
import type { RoomBoundingLineData } from '@pryzm/core-app-model/stores';
import { RoomBoundingLineBuilder } from '../src/RoomBoundingLineBuilder';

function makeRecord(id: string): RoomBoundingLineData {
  return {
    id,
    type: 'RoomBoundingLine',
    levelId: 'level-0',
    placement: {
      start: { x: 0, z: 0 },
      end:   { x: 4, z: 0 },
    },
    properties: { mark: 'RB-00-001', isActive: true },
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
  };
}

const stubBimManager = {} as unknown as ConstructorParameters<typeof RoomBoundingLineBuilder>[1];

describe('§FIX-RBL-IDONLY-EVENT-NO-RENDER (L-172)', () => {
  it('BUG: feeding the {id}-only event detail into build() skips (no mesh)', () => {
    const scene = new THREE.Scene();
    const builder = new RoomBoundingLineBuilder(scene, stubBimManager);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // This is what the OLD handler did: pass the raw event detail straight in.
    const idOnlyEventDetail = { id: 'rbl-1' } as unknown as RoomBoundingLineData;
    builder.build(idOnlyEventDetail);

    expect(builder.getAllIds()).toEqual([]);           // guard skipped it
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('§RBL-PLACEMENT-GUARD'),
    );
    warn.mockRestore();
  });

  it('FIX: resolving id → full record from the store renders a line mesh', () => {
    const store = new RoomBoundingLineStore();
    const scene = new THREE.Scene();
    const builder = new RoomBoundingLineBuilder(scene, stubBimManager);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const record = makeRecord('rbl-1');
    store.add(record);

    // The store emits `{ id }`-only (F.events.17); the fixed handler resolves the
    // full record by id before building.
    const eventDetail = { id: 'rbl-1' };
    const resolved = store.get(eventDetail.id);
    expect(resolved).toBeDefined();
    expect(Number.isFinite(resolved!.placement.start.x)).toBe(true);
    expect(Number.isFinite(resolved!.placement.end.x)).toBe(true);

    builder.build(resolved!);

    // Guard passed — a mesh was produced.
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('§RBL-PLACEMENT-GUARD'),
    );
    expect(builder.getAllIds()).toEqual(['rbl-1']);

    const root = scene.children.find(
      (o): o is THREE.Group => o instanceof THREE.Group && o.userData?.id === 'rbl-1',
    );
    expect(root).toBeDefined();

    const line = root!.children.find((o): o is THREE.Line => o instanceof THREE.Line);
    expect(line).toBeDefined();
    const positions = (line!.geometry as THREE.BufferGeometry).getAttribute('position');
    expect(positions.count).toBe(2);
    for (let i = 0; i < positions.array.length; i++) {
      expect(Number.isFinite(positions.array[i])).toBe(true);
    }
    warn.mockRestore();
  });
});
