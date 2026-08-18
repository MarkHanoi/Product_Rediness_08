/**
 * §FIX-SHADOW-TIER-CASTER-DESTROY (founder L-908) — the tier's shadow-CASTER-SET flip
 * must be ORDERED AGAINST SUBMISSION.
 *
 * WHAT L-908 ACTUALLY IS
 * ---------------------
 * L-908 is the unexplained FIRST fault of L-930. L-930's own entry says of its log:
 * "Step 2 is a recovery from an EARLIER render failure that is not in the captured log —
 * that first fault is itself unexplained." L-908 IS that first fault, captured WITH its
 * trigger: a generation batch + `batchAutoFrame`. `§L930-DETACH-BEFORE-FREE` (59e0659f)
 * closed the SECOND fault — the recovery's own unordered free — and said so explicitly
 * ("§RECOVERY-MUST-REFUSE is untouched … It should simply no longer be REACHED"). It did
 * not touch what caused the first one. This file is the first one.
 *
 * THE THREE LINES THAT ARE THE WHOLE BUG
 * --------------------------------------
 *  1. `initScene.ts` wires `batchCoordinator.setPostBatchCallback(...)` →
 *     `applyTierForMeshCount(meshCount)` at BATCH END.
 *  2. `RenderingPipelineCoordinator.ts:651/:665` then pull TWO `castShadow` levers
 *     (`ShadowQualityUpgrader.setShadowsEnabled` → `light.castShadow = false`;
 *     `_onTierSceneShadow` → `PascalSceneLighting.setShadowsSuppressed` →
 *     `keyLight.castShadow = false`) OUTSIDE every guard, gated on the raw mesh count
 *     crossing 8000 — a threshold a generation batch crosses exactly ONCE, at exactly
 *     the moment `batchAutoFrame` is submitting frames.
 *  3. `initScene.ts:3630` — `if (batchCoordinator.isBatching) return;` — means
 *     `§FIX-SHADOW-WALLCOMMIT-DESTROY`, the one latch that would have covered this,
 *     NEVER ARMS DURING A BATCH AT ALL.
 *
 * WHY A FREEZE IS NOT THE FIX HERE (and why this is a SIBLING of ADR-0111, not a rival)
 * ------------------------------------------------------------------------------------
 * `setShadowReallocFrozen` sets `autoUpdate=false`, which suppresses the depth PASS. That
 * is exactly right for a mapSize realloc and that half is clean (§SHADOW-MAP-REALLOC-AT-
 * BOUNDARY / §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY, L-819). It does NOTHING for a caster-set
 * change: when a light stops casting, THREE drops its `ShadowNode` and releases the
 * `ShadowDepthTexture` on its OWN schedule inside the next `render()` — the L-25
 * mechanism verbatim, with the tier gate pulling the lever instead of the nav gate.
 * The only ordering that helps is: submit nothing until the previous frames have drained,
 * THEN let the destroy happen.
 *
 * ⚠ THIS DOES NOT OVERTURN ADR-0111. ADR-0111 permits a PERSISTENT `castShadow` clear on
 * the heavy-tier gate, and its stated justification is that it "happens once and stays".
 * This call site NEVER MET THAT PRECONDITION: `applyTierForMeshCount` is re-evaluated on
 * every geometry event — the coordinator's own throttle comment records 188× during one
 * generation. The ADR's rule is intact; this caller was never inside it.
 *
 * THE CONTROL
 * -----------
 * `guard opens on a real crossing` was written and WATCHED RED against the unrewired
 * call sites (the guard hook existed and was never invoked) before the fix landed. A
 * device-loss test that cannot fail is worthless.
 *
 * Asserted with ORDERING and COUNTS, never wall-clock (L-234 / L-247).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RenderingPipelineCoordinator } from './RenderingPipelineCoordinator';
import { sceneQualityTierManager } from './SceneQualityTierManager';

/** The documented ceiling. Mirrors the private constant under test. */
const CEILING = 8000;

describe('RenderingPipelineCoordinator §FIX-SHADOW-TIER-CASTER-DESTROY (L-908)', () => {
    let coordinator: RenderingPipelineCoordinator;
    /** Nesting depth of the injected caster guard — the stand-in for "submits paused". */
    let guardDepth: number;
    /** Guard depth observed AT THE INSTANT each castShadow lever fired. */
    let depthAtLever: number[];
    /** How many times the guard was entered at all. */
    let guardEntries: number;

    beforeEach(() => {
        sceneQualityTierManager.reset();
        coordinator = new RenderingPipelineCoordinator();
        guardDepth   = 0;
        depthAtLever = [];
        guardEntries = 0;

        coordinator.setShadowCasterGuardHook((mutate) => {
            guardEntries++;
            guardDepth++;
            try { mutate(); }
            finally { guardDepth--; }
        });
        coordinator.setTierSceneShadowHook(() => { depthAtLever.push(guardDepth); });
    });

    // ── THE CONTROL — watched RED before the call sites were rewired ──────────

    it('CONTROL: crossing the 8000 ceiling flips the caster set INSIDE the guard', () => {
        coordinator.applyTierForMeshCount(100, true);       // shadows ON  (no transition)
        coordinator.applyTierForMeshCount(13_652, true);    // → shadows OFF: a REAL crossing

        // The lever that clears `keyLight.castShadow` must have fired with the guard open.
        expect(depthAtLever.at(-1)).toBe(1);
        expect(guardEntries).toBe(1);
    });

    it('CONTROL: the crossing BACK (heavy → light) is guarded too', () => {
        coordinator.applyTierForMeshCount(13_652, true);    // → OFF
        coordinator.applyTierForMeshCount(500, true);       // → ON  (re-arms castShadow)

        expect(depthAtLever).toEqual([1, 1]);
        expect(guardEntries).toBe(2);
    });

    // ── THE COST CEILING — the fix must not become a 188-stutter perf defect ──

    it('does NOT open the guard on a non-transition (the 188×-per-generation path)', () => {
        coordinator.applyTierForMeshCount(10_000, true);    // one real crossing
        coordinator.applyTierForMeshCount(10_000, true);
        coordinator.applyTierForMeshCount(11_000, true);
        coordinator.applyTierForMeshCount(12_000, true);

        // One crossing ⇒ exactly one paused window, no matter how many re-asserts follow.
        expect(guardEntries).toBe(1);
        // …but the lever still fires EVERY time (the §PERF-HEAVY-SHADOW-OFF contract:
        // an idempotent re-assert, never a one-shot latch). Only the WINDOW is conditional.
        expect(depthAtLever).toEqual([1, 0, 0, 0]);
    });

    it('a small scene never pauses submits at all (cold start ⇒ shadows already ON)', () => {
        coordinator.applyTierForMeshCount(50, true);
        coordinator.applyTierForMeshCount(400, true);
        expect(guardEntries).toBe(0);
        expect(depthAtLever).toEqual([0, 0]);
    });

    it('fires exactly ON the boundary (>= is the contract, not >)', () => {
        coordinator.applyTierForMeshCount(CEILING - 1, true);
        expect(guardEntries).toBe(0);
        coordinator.applyTierForMeshCount(CEILING, true);
        expect(guardEntries).toBe(1);
    });

    // ── SAFETY — a throwing lever must not strand the pause ───────────────────

    it('a throwing lever never escapes, and never strands the guard open', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        coordinator.setTierSceneShadowHook(() => { throw new Error('renderer disposed'); });

        expect(() => coordinator.applyTierForMeshCount(10_000, true)).not.toThrow();
        expect(guardDepth).toBe(0);   // the `finally` in the guard closed the window
        warn.mockRestore();
    });

    // ── NON-REGRESSION — the guard is a SIBLING of the realloc guard, not a merge ──

    it('the REALLOC guard is a separate seam and is NOT driven by a caster crossing', () => {
        const reallocCalls: number[] = [];
        coordinator.setShadowReallocGuardHook((mutate) => { reallocCalls.push(1); mutate(); });

        // A ceiling crossing INSIDE one tier (`performance` spans 2500–15000) changes the
        // caster set but not the tier, so no mapSize realloc is due. The two guards must
        // not have been collapsed into one: conflating them would under-protect whichever
        // ordering lost.
        coordinator.applyTierForMeshCount(2_600, true);
        coordinator.applyTierForMeshCount(13_000, true);

        expect(guardEntries).toBe(1);            // caster guard: one crossing
        expect(reallocCalls.length).toBe(0);     // realloc guard: untouched
    });

    it('project dispose forgets the caster-gate latch (next project re-guards its first crossing)', () => {
        coordinator.applyTierForMeshCount(13_652, true);
        expect(guardEntries).toBe(1);

        coordinator.dispose();
        sceneQualityTierManager.reset();

        coordinator.applyTierForMeshCount(13_652, true);
        expect(guardEntries).toBe(2);            // NOT skipped as "already off"
    });
});
