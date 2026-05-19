// WallCommitter end-to-end tests (S09-T2 — 6 cases).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09 Done When
// (line 700): "WallCommitter round-trips a 100-wall scene without
// allocations on the steady state.  Geometry rebuild fires only on
// the geometry-affecting fields; material rebind fires only on the
// material-affecting fields; visibility toggles flip the proxy mesh
// without touching geometry."
//
// We assert the FULL committer surface using the host's commit
// pipeline directly (no rAF, no scheduler) — this lets us synthesise
// SceneDeltas and read the registry / pool / committer-stats after
// each one.
//
// THREE-only test — lives under `plugins/wall/__tests__/` which is
// allowlisted by `pryzm/no-three-outside-committer`.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { Wall, createId } from '@pryzm/plugin-sdk';
import {
  CommitterHost,
  type SceneDelta,
} from '@pryzm/plugin-sdk';
import { WallCommitter } from '../src/committer/index.js';
import type { WallData } from '../src/store.js';

function w(overrides: Partial<WallData> = {}): WallData {
  return Wall.parse({
    id: createId('wall'),
    levelId: '',
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    height: 2.7,
    thickness: 0.2,
    materialColor: '#d4c5b0',
    ...overrides,
  }) as WallData;
}

function setup() {
  const host = new CommitterHost();
  const committer = new WallCommitter(host.materialPool);
  host.register(committer);
  return { host, committer };
}

async function commit(host: CommitterHost, delta: SceneDelta): Promise<void> {
  await host.commit(delta);
}

describe('WallCommitter (S09-T2)', () => {
  it('reifies a wall on add — Group root, single mesh, material acquired', async () => {
    const { host, committer } = setup();
    const dto = w();

    await commit(host, {
      kind: 'add',
      primitiveType: 'wall',
      id: dto.id,
      dto,
    });

    expect(host.registry.size()).toBe(1);
    const root = host.registry.get(dto.id);
    expect(root).toBeInstanceOf(THREE.Group);
    const group = root as THREE.Group;
    // First child: the visible Mesh; no proxy mesh on a visible wall.
    expect(group.children.length).toBe(1);
    expect(group.children[0]).toBeInstanceOf(THREE.Mesh);

    // MaterialPool acquired ≥ 1 material; geometry has bounds + index.
    expect(host.materialPool.size()).toBeGreaterThanOrEqual(1);
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh.geometry.boundingBox).not.toBeNull();
    expect(mesh.geometry.getIndex()).not.toBeNull();

    // Stats reflect the add.
    const stats = committer.stats();
    expect(stats.walls).toBe(1);
    expect(stats.meshesCreated).toBe(1);
    expect(stats.geometryRebuilds).toBe(0);

    host.dispose();
  });

  it('skips geometry rebuild when descriptor hash is unchanged (no-op patch)', async () => {
    const { host, committer } = setup();
    const dto = w();

    await commit(host, { kind: 'add', primitiveType: 'wall', id: dto.id, dto });
    const root = host.registry.get(dto.id) as THREE.Group;
    const meshBefore = root.children[0] as THREE.Mesh;
    const geometryBefore = meshBefore.geometry;

    // Same DTO again as an UPDATE — descriptor hash should be byte-
    // identical so the committer must NOT rebuild the geometry.
    await commit(host, { kind: 'update', primitiveType: 'wall', id: dto.id, dto });

    const meshAfter = root.children[0] as THREE.Mesh;
    expect(meshAfter).toBe(meshBefore); // Mesh identity preserved
    expect(meshAfter.geometry).toBe(geometryBefore); // GPU buffer reused

    const stats = committer.stats();
    expect(stats.geometryRebuilds).toBe(0);
    expect(stats.geometrySkippedByHash).toBe(1);

    host.dispose();
  });

  it('rebuilds geometry when a geometry-affecting field changes', async () => {
    const { host, committer } = setup();
    const dto = w();

    await commit(host, { kind: 'add', primitiveType: 'wall', id: dto.id, dto });
    const root = host.registry.get(dto.id) as THREE.Group;
    const geometryBefore = (root.children[0] as THREE.Mesh).geometry;

    // Change `height` — geometry-affecting.
    const moved: WallData = { ...dto, height: 3.5 };
    await commit(host, {
      kind: 'update',
      primitiveType: 'wall',
      id: dto.id,
      dto: moved,
    });

    const geometryAfter = (root.children[0] as THREE.Mesh).geometry;
    expect(geometryAfter).not.toBe(geometryBefore);
    expect(committer.stats().geometryRebuilds).toBe(1);

    host.dispose();
  });

  it('rebinds materials WITHOUT geometry rebuild on material-only patch (SetWallColor)', async () => {
    const { host, committer } = setup();
    const dto = w();

    await commit(host, { kind: 'add', primitiveType: 'wall', id: dto.id, dto });
    const root = host.registry.get(dto.id) as THREE.Group;
    const geometryBefore = (root.children[0] as THREE.Mesh).geometry;

    // Material-only change — geometry must NOT rebuild.
    const recoloured: WallData = { ...dto, materialColor: '#a04040' };
    await commit(host, {
      kind: 'update',
      primitiveType: 'wall',
      id: dto.id,
      dto: recoloured,
    });

    const geometryAfter = (root.children[0] as THREE.Mesh).geometry;
    expect(geometryAfter).toBe(geometryBefore);

    const stats = committer.stats();
    expect(stats.geometryRebuilds).toBe(0);
    expect(stats.materialRebinds).toBe(1);

    host.dispose();
  });

  it('toggles the proxy mesh on visibility change without touching geometry', async () => {
    const { host, committer } = setup();
    const dto = w();

    await commit(host, { kind: 'add', primitiveType: 'wall', id: dto.id, dto });
    const root = host.registry.get(dto.id) as THREE.Group;
    expect(root.children.length).toBe(1); // visible mesh only

    // Hide — proxy added, visible mesh hidden.
    const hidden = { ...dto, visible: false } as WallData & { visible: boolean };
    await commit(host, {
      kind: 'update',
      primitiveType: 'wall',
      id: dto.id,
      dto: hidden as WallData,
    });
    expect(root.children.length).toBe(2);
    const proxy = root.children.find((c) => c !== root.children[0]) as THREE.Mesh;
    expect(proxy).toBeInstanceOf(THREE.Mesh);
    const proxyMat = proxy.material as THREE.MeshBasicMaterial;
    expect(proxyMat.colorWrite).toBe(false);
    expect(proxyMat.depthWrite).toBe(false);
    expect((root.children[0] as THREE.Mesh).visible).toBe(false);

    // Un-hide — proxy removed, visible mesh visible.
    const visible = { ...dto, visible: true } as WallData & { visible: boolean };
    await commit(host, {
      kind: 'update',
      primitiveType: 'wall',
      id: dto.id,
      dto: visible as WallData,
    });
    expect(root.children.length).toBe(1);
    expect((root.children[0] as THREE.Mesh).visible).toBe(true);

    expect(committer.stats().geometryRebuilds).toBe(0);
    expect(committer.stats().visibilityToggles).toBe(2);

    host.dispose();
  });

  it('shares one material across 100 walls of the same colour (MaterialPool dedupe)', async () => {
    const { host, committer } = setup();

    // 100 walls — identical materialColor, slightly different positions
    // (so geometry hashes differ, but material keys are byte-identical).
    for (let i = 0; i < 100; i++) {
      const dto = w({
        id: createId('wall'),
        baseLine: [
          { x: i * 1.0, y: 0, z: 0 },
          { x: i * 1.0 + 4, y: 0, z: 0 },
        ],
      });
      await commit(host, { kind: 'add', primitiveType: 'wall', id: dto.id, dto });
    }

    expect(committer.stats().walls).toBe(100);
    expect(host.registry.size()).toBe(100);

    // The kernel emits ONE material key per descriptor group; for a
    // monolithic wall (no layers) that's exactly 1 key per wall, all
    // identical → pool size MUST be 1.
    expect(host.materialPool.size()).toBe(1);

    host.dispose();
    expect(host.registry.size()).toBe(0);
    expect(host.materialPool.size()).toBe(0);
  });
});
