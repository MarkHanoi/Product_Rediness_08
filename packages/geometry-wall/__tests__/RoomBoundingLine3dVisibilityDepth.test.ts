/**
 * §FIX-RBL-3D-XRAY-ALWAYS-ON (L-210) — regression spec.
 *
 * Two defects were fixed in RoomBoundingLineBuilder:
 *   1. X-RAY — the dashed line + the endpoint diamonds were built with
 *      `depthTest: false` (+ `renderOrder = 1/2`), so every floor's boundary
 *      lines painted OVER the roof / façade at once.
 *   2. ALWAYS-ON — the 3D mesh defaulted to visible with no visibility-intent
 *      path ever hiding it.
 *
 * A room-bounding line is a PLAN / documentation construct; its 3D mesh must
 * default HIDDEN (P7 — visibility is domain intent) and become visible only via
 * the visibility path (setVisible). When shown it must occlude correctly (real
 * depth testing), not x-ray.
 *
 * This pins:
 *   (a) the 3D representation is NOT visible by default;
 *   (b) enabling it via the visibility path (setVisible) shows it — including
 *       roots built AFTER the flag was flipped;
 *   (c) neither the line material nor the diamond material disables depth testing;
 *   (d) the plan-view representation is unaffected — the builder still produces
 *       the full line geometry (2 points), it is merely hidden; the plan
 *       technical drawing is projected by a separate pipeline that never reads
 *       the scene `.visible` flag, so default-hiding the 3D mesh cannot change it.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
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
  } as RoomBoundingLineData;
}

const stubBimManager = {} as unknown as ConstructorParameters<typeof RoomBoundingLineBuilder>[1];

function rootFor(scene: THREE.Scene, id: string): THREE.Group | undefined {
  return scene.children.find(
    (o): o is THREE.Group => o instanceof THREE.Group && o.userData?.id === id,
  );
}

describe('§FIX-RBL-3D-XRAY-ALWAYS-ON (L-210)', () => {
  it('(a) the 3D representation is NOT visible by default', () => {
    const scene = new THREE.Scene();
    const builder = new RoomBoundingLineBuilder(scene, stubBimManager);

    expect(builder.isVisible()).toBe(false);

    builder.build(makeRecord('rbl-1'));
    const root = rootFor(scene, 'rbl-1');
    expect(root).toBeDefined();
    expect(root!.visible).toBe(false);
  });

  it('(b) enabling it via the visibility path (setVisible) shows it', () => {
    const scene = new THREE.Scene();
    const builder = new RoomBoundingLineBuilder(scene, stubBimManager);

    builder.build(makeRecord('rbl-1'));
    expect(rootFor(scene, 'rbl-1')!.visible).toBe(false);

    // Visibility intent turns the overlay on — existing roots flip.
    builder.setVisible(true);
    expect(builder.isVisible()).toBe(true);
    expect(rootFor(scene, 'rbl-1')!.visible).toBe(true);

    // Roots built AFTER the flag was flipped inherit the intent.
    builder.build(makeRecord('rbl-2'));
    expect(rootFor(scene, 'rbl-2')!.visible).toBe(true);

    // ...and turning it back off hides everything again.
    builder.setVisible(false);
    expect(rootFor(scene, 'rbl-1')!.visible).toBe(false);
    expect(rootFor(scene, 'rbl-2')!.visible).toBe(false);
  });

  it('(c) neither the line nor the diamond material disables depth testing', () => {
    const scene = new THREE.Scene();
    const builder = new RoomBoundingLineBuilder(scene, stubBimManager);
    builder.build(makeRecord('rbl-1'));
    const root = rootFor(scene, 'rbl-1')!;

    const line = root.children.find((o): o is THREE.Line => o instanceof THREE.Line)!;
    const diamonds = root.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);

    expect(line).toBeDefined();
    expect(diamonds.length).toBe(2);

    // THREE material.depthTest defaults to `true`; the fix must NOT set it false.
    expect((line.material as THREE.Material).depthTest).toBe(true);
    for (const d of diamonds) {
      expect((d.material as THREE.Material).depthTest).toBe(true);
    }

    // The x-ray render-order overrides (renderOrder = 1/2) are gone — normal
    // depth-sorted rendering (default 0).
    expect(line.renderOrder).toBe(0);
    for (const d of diamonds) expect(d.renderOrder).toBe(0);
  });

  it('(d) the boundary geometry is still produced (representation intact, just hidden)', () => {
    const scene = new THREE.Scene();
    const builder = new RoomBoundingLineBuilder(scene, stubBimManager);
    builder.build(makeRecord('rbl-1'));
    const root = rootFor(scene, 'rbl-1')!;

    // The element is still fully built (data-driven area/finish consumers and the
    // separate plan-view projection pipeline depend on the record); the 3D mesh is
    // merely default-hidden — nothing was deleted.
    const line = root.children.find((o): o is THREE.Line => o instanceof THREE.Line)!;
    const positions = (line.geometry as THREE.BufferGeometry).getAttribute('position');
    expect(positions.count).toBe(2);
    expect(builder.getAllIds()).toEqual(['rbl-1']);
  });
});
