// Bench: `picking.bvh-pick.latency` — S16-T9 / spec line 763.
//
// Spec target: < 10 ms p95 click-to-select on the production gpu-pick
// path.  In Node-only `apps/bench/**` we cannot exercise gpu-pick (no
// GL context), so we measure the BVH-pick CPU surrogate instead.  The
// CPU surrogate is faithful for the BVH path itself; the gpu-pick path
// is gated separately in headed Chromium follow-up work (carried
// forward from S15 — see PROCESS-TRACKER §1C bench audit row).
//
// Two scenarios:
//
//   1.  warm-cache.pick   : 1,000 same-geometry boxes; BVH cache warm
//                            after first pick.  Hard-fail at 12 ms p95
//                            (spec gate for the BVH path).
//
//   2.  cold-cache.pick   : same workload but a fresh strategy each
//                            sample.  Captures the worst-case build
//                            cost; warn-only at 100 ms p95 (the cold
//                            path is amortised over a session).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
  BvhPickStrategy,
  type ElementRegistry,
  type PickContext,
} from '@pryzm/picking';
import { writeBenchSample } from '../save-baseline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

const ELEMENT_COUNT = 1_000;
const PICK_SAMPLES = 200;
const PICK_WARMUP = 20;
const WARM_CACHE_HARD_FAIL_MS = 12;       // BVH-pick budget per ADR-0015.
const WARM_CACHE_WARN_MS = 8;             // pre-budget headroom check.
const COLD_CACHE_WARN_MS = 100;           // amortised; warn-only.

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Number((sorted[idx] ?? 0).toFixed(3));
}

interface Element {
  id: string;
  mesh: THREE.Mesh;
}

function buildScene(count: number): { elements: Element[]; registry: ElementRegistry } {
  // Grid layout — every mesh at a unique world position so picks
  // can be aimed deterministically.  Geometry is shared (a hash is not
  // wired; cache treats every miss as a build).
  const sharedGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const elements: Element[] = [];
  const side = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const x = (i % side) - side / 2;
    const z = Math.floor(i / side) - side / 2;
    const mesh = new THREE.Mesh(sharedGeo, new THREE.MeshBasicMaterial());
    mesh.position.set(x, 0, z);
    mesh.updateMatrixWorld(true);
    elements.push({ id: `elem-${i}`, mesh });
  }
  const idToMesh = new Map(elements.map((e) => [e.id, e.mesh]));
  const registry: ElementRegistry = {
    kindOf: () => 'wall',
    ids: () => elements.map((e) => e.id),
    objectFor: (id) => idToMesh.get(id) ?? null,
    descriptorHashOf: () => 'shared-geo',
  };
  return { elements, registry };
}

function buildCtx(registry: ElementRegistry): PickContext {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 30, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return {
    camera,
    elementRegistry: registry,
    viewportWidth: 1080,
    viewportHeight: 1080,
  };
}

describe('picking.bvh-pick.latency (S16-T9)', () => {
  it(`warm-cache pick over ${ELEMENT_COUNT} elements: p95 < ${WARM_CACHE_HARD_FAIL_MS} ms`, () => {
    const { registry } = buildScene(ELEMENT_COUNT);
    const ctx = buildCtx(registry);
    const strategy = new BvhPickStrategy();

    // Warmup — primes the BVH cache for every element so subsequent
    // picks hit the warm path.  Pick at the screen centre; many of the
    // 1,000 BVHs will be raycast on each pick which is exactly the
    // hot-path the production click-to-select traverses.
    for (let i = 0; i < PICK_WARMUP; i++) {
      strategy.pick({ x: 540, y: 540 }, ctx);
    }

    const observations: number[] = [];
    for (let i = 0; i < PICK_SAMPLES; i++) {
      // Deterministic jitter — keeps the BVH ray varying so the
      // fast-out paths get exercised.
      const px = 540 + ((i * 37) % 200) - 100;
      const py = 540 + ((i * 53) % 200) - 100;
      const t0 = performance.now();
      strategy.pick({ x: px, y: py }, ctx);
      observations.push(performance.now() - t0);
    }
    observations.sort((a, b) => a - b);
    const p50 = percentile(observations, 50);
    const p95 = percentile(observations, 95);
    const p99 = percentile(observations, 99);

    writeBenchSample({
      name: 'picking.bvh-pick.warm.pick',
      samples: observations.length,
      p50,
      p95,
      p99,
      budgetMs: WARM_CACHE_HARD_FAIL_MS,
      warnMs: WARM_CACHE_WARN_MS,
      recordedAt: new Date().toISOString(),
    });

    // Verbose log so CI artifacts capture the numbers.
     
    console.log(
      `[picking.bvh-pick.warm.pick] samples=${observations.length} p50=${p50}ms p95=${p95}ms p99=${p99}ms (budget ${WARM_CACHE_HARD_FAIL_MS}ms / warn ${WARM_CACHE_WARN_MS}ms)`,
    );

    expect(p95).toBeLessThan(WARM_CACHE_HARD_FAIL_MS);
    strategy.dispose();
  });

  it(`cold-cache pick: warn-only @ p95 < ${COLD_CACHE_WARN_MS} ms`, () => {
    const { registry } = buildScene(ELEMENT_COUNT);
    const ctx = buildCtx(registry);

    // Cold-cache surrogate — measure ONE pick on a fresh strategy so
    // every element's BVH is built exactly once.  This is the worst
    // case (project load → first click) and is amortised; we capture
    // it as a warn-only baseline.
    const observations: number[] = [];
    const COLD_SAMPLES = 5; // expensive — keep small
    for (let i = 0; i < COLD_SAMPLES; i++) {
      const strategy = new BvhPickStrategy();
      const t0 = performance.now();
      strategy.pick({ x: 540, y: 540 }, ctx);
      observations.push(performance.now() - t0);
      strategy.dispose();
    }
    observations.sort((a, b) => a - b);
    const p50 = percentile(observations, 50);
    const p95 = percentile(observations, 95);
    const p99 = percentile(observations, 99);

    writeBenchSample({
      name: 'picking.bvh-pick.cold.pick',
      samples: observations.length,
      p50,
      p95,
      p99,
      budgetMs: COLD_CACHE_WARN_MS,
      warnMs: COLD_CACHE_WARN_MS,
      recordedAt: new Date().toISOString(),
    });
     
    console.log(
      `[picking.bvh-pick.cold.pick] samples=${observations.length} p50=${p50}ms p95=${p95}ms p99=${p99}ms (warn ${COLD_CACHE_WARN_MS}ms)`,
    );

    // Warn-only — never hard-fails.
    expect(observations.length).toBeGreaterThan(0);
  });
});
