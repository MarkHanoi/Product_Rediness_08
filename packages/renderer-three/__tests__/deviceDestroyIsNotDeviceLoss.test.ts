/**
 * §DEVICE-DESTROY-IS-NOT-DEVICE-LOSS (L-1001) — a device WE destroyed must never be
 * reported to the app as a device that FAILED.
 *
 * MEASURED, founder production capture 2026-08-18 (the third sample alongside L-981):
 *   [renderer-three/WebGPURendererAdapter] WebGPU device lost: reason="destroyed", …
 *   [createRenderer] WebGPU device lost: reason="destroyed", …
 * Two `gpuDevice.lost` handlers on the SAME device, printing back to back.
 * `createRenderer.ts` carried the guard (`if (info.reason === 'destroyed') return;`)
 * and stopped. `WebGPURendererAdapter`'s handler had no guard and fired its
 * `onContextLost` callbacks anyway — kicking the app-level recovery pipeline
 * (CW-prewarm reset → 5 s cooldown → renderer dispose → renderer recreate → RPM
 * rebind) for a fault that did not occur. That pipeline retires a renderer, which
 * destroys a device, which resolves another `lost`.
 *
 * `reason="destroyed"` is not ambiguous and is not a driver event: per the WebGPU
 * spec it means `device.destroy()` was CALLED. In this codebase that call is the last
 * step of `retireRenderer()` → `renderer.dispose()` → `backend.destroy()` — the
 * normal end of every live backend swap (ADR-0077 §RENDERER-LIVE-SWAP), every
 * device-loss REBUILD, and every adapter teardown.
 *
 * ⛔ This is NOT a suppression and weakens no diagnostic. Both handlers still log the
 * raw `reason` and `message` verbatim BEFORE consulting this predicate. What it
 * prevents is a deliberate teardown masquerading as a failure.
 *
 * The defect was not that one handler was wrong — it was that the rule lived as a
 * LITERAL inside one call site instead of as a shared authority both could consult,
 * so the two could and did disagree. These tests pin the authority itself.
 */

import { describe, it, expect } from 'vitest';
import { isDeliberateDeviceDestroy } from '../src/rendererRetirement.js';

describe('§DEVICE-DESTROY-IS-NOT-DEVICE-LOSS (L-1001)', () => {
    it('reason="destroyed" is OUR teardown — never a loss', () => {
        // The exact info object from the founder's capture.
        expect(isDeliberateDeviceDestroy({ reason: 'destroyed' })).toBe(true);
    });

    it('reason="unknown" is a REAL device failure — recovery must still run', () => {
        // TOOTH: the whole risk of this change is over-classifying. A driver reset,
        // a GPU hang or a browser eviction all arrive as "unknown", and every one of
        // them needs the recovery pipeline that L-1001 stops firing for "destroyed".
        expect(isDeliberateDeviceDestroy({ reason: 'unknown' })).toBe(false);
    });

    it('an absent or empty reason is treated as a REAL loss (fail toward recovery)', () => {
        // A field we cannot read is not evidence that the teardown was ours. The safe
        // default is the one that still repairs.
        expect(isDeliberateDeviceDestroy({})).toBe(false);
        expect(isDeliberateDeviceDestroy({ reason: '' })).toBe(false);
        expect(isDeliberateDeviceDestroy(null)).toBe(false);
        expect(isDeliberateDeviceDestroy(undefined)).toBe(false);
    });

    it('does not match on substrings or case variants — only the exact spec token', () => {
        expect(isDeliberateDeviceDestroy({ reason: 'Destroyed' })).toBe(false);
        expect(isDeliberateDeviceDestroy({ reason: 'destroyed-by-driver' })).toBe(false);
        expect(isDeliberateDeviceDestroy({ reason: 'not-destroyed' })).toBe(false);
    });

    it('BOTH handlers now agree, because there is only one decision', () => {
        // The founder's capture is reproduced as the two call sites consulting the
        // shared authority. Before L-1001 the adapter's arm returned "recover" and
        // createRenderer's returned "do not" for the SAME info object.
        const info = { reason: 'destroyed' } as const;
        const adapterDecision       = isDeliberateDeviceDestroy(info); // WebGPURendererAdapter
        const createRendererDecision = isDeliberateDeviceDestroy(info); // createRenderer.ts
        expect(adapterDecision).toBe(createRendererDecision);
        expect(adapterDecision).toBe(true);
    });
});
