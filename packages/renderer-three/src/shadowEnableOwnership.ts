/**
 * @file packages/renderer-three/src/shadowEnableOwnership.ts
 * @description §SHADOW-ENABLE-SINGLE-OWNER (L-13281) — make the "one writer of
 *   `renderer.shadowMap.enabled`" invariant ENFORCEABLE instead of merely declared.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * FIVE modules across four packages declare, in prose, that a non-live renderer's
 * `shadowMap.enabled` must stay `false`:
 *
 *   • `packages/core-app-model/src/BimWorld.ts:117`         §FIX-SHADOWMAP-DUAL-RENDERER-CLAIM (L-205)
 *   • `apps/editor/src/engine/initScene.ts:1948/1979/2057`  asserted three times over the Phase-5 hand-over
 *   • `apps/editor/src/engine/ViewController.ts:2486`       "shadowMap.enabled MUST remain false"
 *   • `packages/core-app-model/src/rendering/ShadowQualityUpgrader.ts:249`  §SHADOW-ENABLE-IS-NOT-OURS (L-1000)
 *   • `RenderPipelineManager._applyShadowEnabledState()`    "THE ONLY writer of renderer.shadowMap.enabled"
 *
 * ⛔ **Five declarations and zero enforcement is the actual defect.** `shadowMap.enabled`
 * is a plain data property on a plain object; any module, plugin, vendored
 * renderer, future refactor or `as any` cast can set it, and nothing notices. The
 * founder's 3D viewport died on production because SOMETHING re-armed it on the
 * OBC WebGL renderer, and the console carried no record of who — the crash was
 * reported four hops downstream, as
 * `Destroyed texture [Texture "ShadowDepthTexture"] used in a submit`.
 *
 * ── WHY THE WRITE IS FATAL ───────────────────────────────────────────────────
 * Both renderers draw the SAME scene, so both see the same lights, and a THREE
 * light has exactly ONE `LightShadow.map` slot. With the gate at
 * WebGLShadowMap.js:93 open, `WebGLShadowMap.render()` reaches :209/:214 and frees
 * the render target the WebGPU `ShadowNode` is still sampling every frame. It
 * happens on a FOREIGN renderer's frame: outside `RenderPipelineManager.render()`,
 * outside every freeze latch, outside both boundary queues, and unreachable from
 * `_rebuildPipeline()` — which is exactly why §RECOVERY-MUST-REFUSE correctly
 * refuses and the bounded ladder spends 2/2 while the viewport stays dead.
 *
 * ── THE CONTRACT OF THIS SEAL ────────────────────────────────────────────────
 * ⚠ A runtime guard that SILENTLY swallows a write is worse than the crash: it
 * converts a loud, traceable failure into a quiet behavioural difference nobody
 * can find. So this seal does BOTH halves, and the naming half is the important
 * one:
 *
 *   1. It REFUSES the write (the sealed renderer stays at `false`), which is what
 *      keeps the founder's viewport alive.
 *   2. It NAMES THE VIOLATOR LOUDLY — `console.error` with the owner label, the
 *      offending value, and the writer's own stack trace — and records it on
 *      {@link foreignShadowEnableWrites} so a diagnostic surface (and a test) can
 *      read it back. The next time this happens in production the console says
 *      WHO, on the line it happened, instead of naming a destroyed texture four
 *      hops later.
 *
 * Writes of `false` are accepted silently: they agree with the sealed value, and
 * several legitimate modules assert it defensively (ViewController, initScene).
 *
 * P2: this module touches only structural shapes — no `import * as THREE` — and
 * lives in `renderer-three`, the sole THREE owner, so L4/L7 callers reach it
 * through the package facade rather than poking a renderer.
 */

/** The structural shape this module seals — a renderer's `shadowMap` sub-object. */
export interface SealableShadowRenderer {
    shadowMap?: { enabled?: boolean } | null;
}

/** One recorded attempt to arm `shadowMap.enabled` on a sealed (non-owner) renderer. */
export interface ForeignShadowEnableWrite {
    /** The label the seal was installed with, e.g. `'OBC postproductionRenderer.three'`. */
    owner: string;
    /** The value the violator tried to write (always `true`; `false` is accepted). */
    attempted: boolean;
    /** The violator's stack at the moment of the write, or null if unavailable. */
    stack: string | null;
    /** `Date.now()` at the write. */
    at: number;
}

/**
 * Every refused arming attempt, newest last. Read by diagnostics and by the
 * binding test — a seal that cannot prove it fired is the vacuous shape this
 * module exists to replace.
 */
const _foreignWrites: ForeignShadowEnableWrite[] = [];

/** All refused `shadowMap.enabled = true` attempts recorded this session. */
export function foreignShadowEnableWrites(): readonly ForeignShadowEnableWrite[] {
    return _foreignWrites;
}

/** Clear the recorded attempts (tests only). */
export function resetForeignShadowEnableWrites(): void {
    _foreignWrites.length = 0;
}

/**
 * §SHADOW-ENABLE-SINGLE-OWNER — seal `shadowMap.enabled` at `false` on a renderer
 * that is NOT the live one, refusing and loudly naming any attempt to arm it.
 *
 * Install this on every renderer that shares the live scene but must never run a
 * shadow pass — in practice OBC's `postproductionRenderer.three` once Phase 5 has
 * handed rendering to the PRYZM WebGPU renderer.
 *
 * IDEMPOTENT: sealing an already-sealed renderer returns the existing release
 * handle rather than stacking accessors.
 *
 * @param renderer   the foreign renderer to seal (null/undefined is a no-op).
 * @param ownerLabel a human name for the renderer, printed in the violation.
 * @returns a release handle that restores a plain, writable data property. Call it
 *          when the sealed renderer legitimately becomes the live one (the Phase-5
 *          failure rollback), NEVER to work around a violation.
 */
export function sealShadowMapEnabled(
    renderer: SealableShadowRenderer | null | undefined,
    ownerLabel: string,
): () => void {
    const noop = (): void => { /* nothing was sealed */ };
    const shadowMap = renderer?.shadowMap;
    if (!shadowMap) return noop;

    const sealed = shadowMap as { enabled?: boolean; __pryzmShadowEnableSeal?: () => void };
    // Idempotent — a second seal must not stack a getter over a getter.
    if (typeof sealed.__pryzmShadowEnableSeal === 'function') {
        return sealed.__pryzmShadowEnableSeal;
    }

    const descriptor = Object.getOwnPropertyDescriptor(shadowMap, 'enabled');
    // An accessor is already installed by someone else (a vendored proxy, a test
    // double). Refuse to seal rather than fight over the slot — and say so, since
    // a seal that silently did nothing is the failure mode this file is about.
    if (descriptor && !('value' in descriptor)) {
        console.warn(
            `[renderer-three] §SHADOW-ENABLE-SINGLE-OWNER cannot seal "${ownerLabel}": ` +
            '`shadowMap.enabled` is already an accessor property, so another owner holds ' +
            'this slot. NOT sealing — the dual-renderer claim stays possible on this renderer.',
        );
        return noop;
    }

    let value = false;
    try {
        Object.defineProperty(shadowMap, 'enabled', {
            configurable: true,
            enumerable:   descriptor?.enumerable ?? true,
            get(): boolean { return value; },
            set(next: boolean): void {
                if (!next) { value = false; return; }
                // ── The violation. Refuse, then NAME IT. ─────────────────────
                const stack = new Error('§SHADOW-ENABLE-SINGLE-OWNER violation').stack ?? null;
                _foreignWrites.push({ owner: ownerLabel, attempted: true, stack, at: Date.now() });
                console.error(
                    `[renderer-three] §SHADOW-ENABLE-SINGLE-OWNER REFUSED \`shadowMap.enabled = true\` ` +
                    `on "${ownerLabel}" — this renderer is NOT the live one, and arming its shadow ` +
                    'pass lets three\'s WebGLShadowMap.render() free the LIVE WebGPU ' +
                    'ShadowDepthTexture out of the shared LightShadow.map slot ' +
                    '(WebGLShadowMap.js:209/214) → "Destroyed texture [ShadowDepthTexture] used in a ' +
                    'submit" → a permanently frozen viewport (§RECOVERY-MUST-REFUSE cannot reach a ' +
                    'light-owned map). The write did NOT take effect. If this renderer genuinely ' +
                    'needs shadows, it must first become the live renderer and the seal must be ' +
                    'released explicitly. THE VIOLATOR IS IN THIS STACK:\n' + (stack ?? '(no stack available)'),
                );
                // Deliberately NOT applied. `value` stays false.
            },
        });
    } catch (err) {
        console.warn(
            `[renderer-three] §SHADOW-ENABLE-SINGLE-OWNER could not seal "${ownerLabel}" ` +
            '(non-fatal; the dual-renderer claim stays possible on this renderer):',
            err instanceof Error ? err.message : err,
        );
        return noop;
    }

    const release = (): void => {
        try {
            delete (shadowMap as { __pryzmShadowEnableSeal?: unknown }).__pryzmShadowEnableSeal;
            Object.defineProperty(shadowMap, 'enabled', {
                configurable: true,
                enumerable:   descriptor?.enumerable ?? true,
                writable:     true,
                value,
            });
            console.log(
                `[renderer-three] §SHADOW-ENABLE-SINGLE-OWNER seal RELEASED on "${ownerLabel}" — ` +
                'this renderer may write `shadowMap.enabled` again. Only do this when it has ' +
                'genuinely become the live renderer.',
            );
        } catch { /* the property is already plain; nothing to restore */ }
    };
    Object.defineProperty(shadowMap, '__pryzmShadowEnableSeal', {
        configurable: true, enumerable: false, writable: true, value: release,
    });

    console.log(
        `[renderer-three] §SHADOW-ENABLE-SINGLE-OWNER sealed \`shadowMap.enabled = false\` on ` +
        `"${ownerLabel}". Any module that tries to arm it is refused AND named with its stack.`,
    );
    return release;
}

/** True iff `renderer.shadowMap.enabled` is currently sealed by {@link sealShadowMapEnabled}. */
export function shadowMapEnabledIsSealed(renderer: SealableShadowRenderer | null | undefined): boolean {
    const sm = renderer?.shadowMap as { __pryzmShadowEnableSeal?: unknown } | null | undefined;
    return typeof sm?.__pryzmShadowEnableSeal === 'function';
}
