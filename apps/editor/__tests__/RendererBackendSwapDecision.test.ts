// §FIX-SWAP-WEBGL-TO-WEBGPU-CRASH (L-153) — the reload-vs-stay-put decision the corner
// backend toggle makes when a live backend switch does not complete.
//
// Regression: a WebGL→WebGPU switch does heavy TSL-pipeline work on a freshly-acquired
// GPU device and can fail; initScene's §RENDERER-LIVE-SWAP catch ROLLS BACK to the still-
// rendering previous renderer and the swap resolves `false`. The old toggle treated that
// `false` the same as "swap unavailable" and called `location.reload()`, which boots to
// the projects HUB — the founder's "switching WebGL→WebGPU crashes back to the project
// page". The fix: fall back to a reload ONLY when there is genuinely no live-swap entry
// point (engine not yet wired); when the swap ran and rolled back, keep the live renderer.

import { describe, expect, it } from 'vitest';
import { shouldFallBackToReload } from '../src/ui/overlays/RendererBackendToggle';

describe('shouldFallBackToReload (§FIX-SWAP-WEBGL-TO-WEBGPU-CRASH)', () => {
  it('reloads ONLY when the live-swap entry point is unavailable', () => {
    expect(shouldFallBackToReload(/* swapAvailable */ false)).toBe(true);
  });

  it('does NOT reload when a live swap is available (a failed swap has already rolled back)', () => {
    // This is the L-153 case: the swap ran, failed, and rolled back to a live renderer.
    // Reloading here is what dumped the user to the project hub — so we must NOT reload.
    expect(shouldFallBackToReload(/* swapAvailable */ true)).toBe(false);
  });
});
