/**
 * L-1413 — TWO predicates, ONE decision. The founder's project, pinned.
 *
 * The founder opened a project (294 elements / 3,191 meshes / 7 levels) and the 3D
 * viewport was empty. His console shows §AUTO-WEBGL-HEAVY live-swapping the renderer
 * immediately after load, `reason=tier:post-load`.
 *
 * C04 §1.4's ADR-0267 amendment quoted the swap's trigger as
 * `LevelScoped3DCullingService.isHeavyModel` — **≥ 15 levels AND ≥ 1,000 elements, OR
 * ≥ 4,000 elements** — which his scene satisfies on NEITHER arm. Read literally, the
 * guard fired on a scene the contract says is not heavy.
 *
 * It did not. The swap has always had its OWN, deliberately lower predicate
 * (ADR-0267 §Fix-1 / L-366: ≥ 400 element roots OR ≥ 1,000 meshes), because a normal
 * ~6-storey generation TDR'd the WebGPU device long before `isHeavyModel` would fire.
 * The divergence is correct; the CONTRACT was stale, and `isHeavyModel`'s own JSDoc
 * asserted a consumer it does not have (measured: zero call sites outside its file).
 *
 * This suite pins BOTH verdicts for the founder's exact numbers, so the next person
 * who reads either document gets the divergence handed to them instead of re-deriving
 * it from a console transcript. It deliberately asserts the DIVERGENCE — if someone
 * later unifies the two predicates, this fails and forces the L-361 regression
 * argument to be made out loud rather than by accident.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The swap gate reads the persisted preference only for warning wording.
const H = vi.hoisted(() => ({ pref: 'auto' as 'auto' | 'webgpu' | 'webgl' }));
vi.mock('../src/rendering/createRenderer', () => ({
  getRendererBackendPreference: () => H.pref,
}));

/**
 * C04 §1.4's quoted predicate, transcribed from
 * `packages/core-app-model/src/rendering/LevelScoped3DCullingService.ts:180`.
 *
 * Transcribed rather than imported ON PURPOSE: `isHeavyModel` is not re-exported from
 * `@pryzm/core-app-model`'s barrel, and the point of this test is precisely that it has
 * no consumers. Importing it would create the first one and quietly make the claim
 * "reuses this EXACT predicate" true-by-test rather than true-in-production.
 */
const isHeavyModel = (levelCount: number, elementCount: number): boolean =>
  (levelCount >= 15 && elementCount >= 1000) || elementCount >= 4000;

/** The founder's project, from his console. */
const FOUNDER = { elements: 233, meshes: 3191, levels: 7 } as const;

interface TestGlobals {
  __pryzmAutoSwappedToWebGL?: boolean;
  bimManager?: unknown;
  pryzmRendererBackend?: 'webgpu' | 'webgl-fallback' | 'webgl-only';
  pryzmSwapRendererBackend?: (pref: string) => Promise<boolean>;
}
const G = (): TestGlobals => globalThis as unknown as TestGlobals;

describe('L-1413 - the swap predicate and the predicate C04 quoted are DIFFERENT', () => {
  let swapMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    H.pref = 'auto';
    swapMock = vi.fn().mockResolvedValue(true);
    delete G().__pryzmAutoSwappedToWebGL;
    G().bimManager = { getLevels: () => Array.from({ length: FOUNDER.levels }, () => ({})) };
    G().pryzmSwapRendererBackend = swapMock as unknown as (p: string) => Promise<boolean>;
    G().pryzmRendererBackend = 'webgpu';
  });

  afterEach(() => {
    delete G().__pryzmAutoSwappedToWebGL;
    delete G().bimManager;
    delete G().pryzmRendererBackend;
    delete G().pryzmSwapRendererBackend;
  });

  it("C04's quoted predicate says the founder's scene is NOT heavy", () => {
    expect(isHeavyModel(FOUNDER.levels, FOUNDER.elements)).toBe(false);
  });

  it('the predicate that ACTUALLY gates the swap says it IS — on the mesh arm', async () => {
    const { isSwapWorthyHeavyScene } = await import('../src/rendering/autoWebGLHeavyScene');
    expect(isSwapWorthyHeavyScene(FOUNDER.elements, FOUNDER.meshes)).toBe(true);
    // …and it is the MESH arm alone that carries it. 233 element roots is well under 400,
    // so a caller that cannot supply a mesh count would NOT fire on this project — which
    // is exactly why the decision cannot simply be moved earlier (C04 §1.4a).
    expect(isSwapWorthyHeavyScene(FOUNDER.elements, undefined)).toBe(false);
  });

  it("end-to-end: the founder's scene fires swap('webgl-classic') at tier:post-load", async () => {
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    const children = Array.from({ length: FOUNDER.elements }, (_, i) => ({ userData: { id: `e${i}` } }));
    mod.maybeAutoSwitchToWebGLForHeavyScene({ children }, 'tier:post-load', FOUNDER.meshes);

    expect(swapMock).toHaveBeenCalledTimes(1);
    expect(swapMock).toHaveBeenCalledWith('webgl-classic');
  });

  it('the two predicates genuinely disagree over a real range — this is not a rounding artefact', async () => {
    const { isSwapWorthyHeavyScene } = await import('../src/rendering/autoWebGLHeavyScene');
    // A ~6-storey residential block: the L-366 case that ADR-0267 §Fix-1 exists for.
    expect(isHeavyModel(6, 1300)).toBe(false);
    expect(isSwapWorthyHeavyScene(1300, 1645)).toBe(true);
    // A single manual edit trips neither.
    expect(isHeavyModel(2, 40)).toBe(false);
    expect(isSwapWorthyHeavyScene(40, 120)).toBe(false);
    // A 40-storey tower trips both.
    expect(isHeavyModel(40, 4200)).toBe(true);
    expect(isSwapWorthyHeavyScene(4200, 12000)).toBe(true);
  });
});
