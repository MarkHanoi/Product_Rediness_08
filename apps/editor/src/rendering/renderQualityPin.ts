/**
 * @file apps/editor/src/rendering/renderQualityPin.ts
 *
 * §RENDER-QUALITY-USER-PIN (L-1512) — the app-side half of the explicit render-quality
 * override: where the user's choice is STORED, and how it REACHES the renderer.
 *
 * THE FOUNDER'S REPORT
 * ───────────────────────────────────────────────────────────────────────────
 *   "Lately the quality WebGPU has decreased — probably to remove some performance error
 *    — however I would like to ad-hoc be able to have a sound rendering shadow quality."
 *
 * He is right about the cause. `SceneQualityTierManager`'s
 * §PERF-LARGE-SCENE-TIER-CAP (ADR-0094) caps ANY scene at/above 1,200 meshes to the
 * `performance` tier — shadowLevel `standard`, decorative-furniture shadows off, no
 * reflection probes — and his real building is ~4,100 meshes. The cap is deliberately
 * DECISIVE (it bypasses the ±10% hysteresis band, because a scene that GREW into the cap
 * would otherwise be held above it), so no amount of editing reaches `balanced` or
 * `cinematic`. That is correct as an automatic default. What was missing is a way for a
 * person to say "I accept the frame cost on THIS scene".
 *
 * WHAT THIS MODULE IS, AND IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * It is the PREFERENCE STORE and the WIRING. The decision itself lives in
 * `SceneQualityTierManager.setTierOverride()` (L2, pure, no I/O — it may not read
 * localStorage). The THREE-side application lives in
 * `RenderingPipelineCoordinator.applyTierForMeshCount()`. This file only carries the
 * value between them, which is why it exists at all: without the re-apply below, a pin
 * would sit in the decision service and change nothing until the next geometry event —
 * "committed ≠ reachable" wearing a settings-panel costume.
 *
 * It uses the SAME store as the renderer-backend corner toggle (`localStorage`, the
 * `pryzm.*` key namespace, storage-safe accessors) rather than introducing a second
 * persistence mechanism for the same class of value.
 *
 * ⚠ A PIN IS A PREFERENCE, NEVER A CAPABILITY CLAIM. `setTierOverride` is applied BEFORE
 * `applyBackendGate`, never instead of it, so a `cinematic` pin on the WebGL2 fallback
 * still comes back with SSGI/TRAA off — WebGL2 physically cannot run the TSL SSGI/TRAA
 * pipeline. The mesh-count shadow ceiling the coordinator applies on top (shadows OFF at
 * ≥ 8,000 meshes, §SHADOW-DEVICE-LOSS-FIX) is likewise a crash guard, not a policy, and a
 * pin does not reach it either.
 *
 * CONTRACTS
 *   C04 — rendering/scheduling: the tier is the sanctioned large-model quality lever.
 *   P2  — no THREE import here.
 *   P3  — no requestAnimationFrame.
 *   P4  — no `(window as any)`; the coordinator is reached through a narrow structural type.
 *   P8  — every exported function opens an OTel span.
 */

import { sceneQualityTierManager, type SceneQualityTier } from '@pryzm/core-app-model/rendering';
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/editor/render-quality-pin', '0.1.0');

function withPinSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.render-quality-pin.${verb}`, { attributes: attrs });
    try {
        const out = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return out;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('error', true);
        throw err;
    } finally {
        span.end();
    }
}

/**
 * The user's render-quality choice. `'auto'` is the DEFAULT and means "let the mesh-count
 * policy decide" — i.e. today's behaviour, byte for byte.
 */
export type RenderQualityPin = 'auto' | SceneQualityTier;

const QUALITY_PIN_KEY = 'pryzm.render.qualityTier';

/**
 * The values the store accepts and returns unchanged.
 *
 * ONE list, read by both the reader and the writer, so "what can be stored" cannot drift
 * from "what may be stored" — the shape §HEURISTIC-MAY-OVERRIDE-A-PIN-BUT-NEVER-OVERWRITE-IT
 * (L-1483) records for the sibling backend preference.
 */
const ROUND_TRIPPABLE_PINS = ['auto', 'cinematic', 'balanced', 'performance', 'survival'] as const;

/** True when `v` is a value the pin store accepts and returns unchanged. */
export function isRenderQualityPin(v: unknown): v is RenderQualityPin {
    return withPinSpan('is-pin', { 'pryzm.render_quality.candidate': String(v) },
        () => (ROUND_TRIPPABLE_PINS as readonly unknown[]).includes(v));
}

/** Read the persisted pin. Storage-safe; `'auto'` when unset or unreadable. */
export function getRenderQualityPin(): RenderQualityPin {
    return withPinSpan('read', {}, () => {
        try {
            const v = globalThis.localStorage?.getItem(QUALITY_PIN_KEY);
            if (isRenderQualityPin(v)) return v;
        } catch {
            /* localStorage unavailable (private mode / non-browser) — fall through */
        }
        return 'auto';
    });
}

/** Persist the pin. Storage-safe — a failure to persist must never break the toggle. */
export function setRenderQualityPin(pin: RenderQualityPin): void {
    withPinSpan('write', { 'pryzm.render_quality.pin': pin }, () => {
        try {
            globalThis.localStorage?.setItem(QUALITY_PIN_KEY, pin);
        } catch {
            /* non-fatal */
        }
    });
}

/**
 * The narrow slice of `RenderingPipelineCoordinator` this module drives.
 *
 * P4 — a structural type, not `(window as any)`: `window.renderingPipelineCoordinator` is
 * declared `unknown`, and this names exactly the one method used.
 */
export interface TierApplier {
    applyTierForMeshCount?: (meshCount: number, isWebGPU?: boolean) => unknown;
}

/**
 * Push the persisted pin into the (module-singleton) tier manager.
 *
 * Called at renderer construction, which is the first thing that runs at boot and the only
 * seam guaranteed to precede the first tier evaluation. Deliberately does NOT re-apply:
 * at boot there is nothing to re-apply to yet, and the first `applyTierForMeshCount` will
 * read the pin on its own. Idempotent — a live backend swap re-runs it with the same value.
 *
 * @returns the pin that was restored.
 */
export function restoreRenderQualityPin(): RenderQualityPin {
    return withPinSpan('restore', {}, () => {
        const pin = getRenderQualityPin();
        sceneQualityTierManager.setTierOverride(pin === 'auto' ? null : pin);
        if (pin !== 'auto') {
            console.log(
                `[renderQualityPin] §RENDER-QUALITY-USER-PIN (L-1512) — restored a user pin: tier="${pin}". `
                + 'The automatic mesh-count policy (ADR-0094) is being overridden for this session.',
            );
        }
        return pin;
    });
}

/** What {@link applyRenderQualityPin} did, so the UI can report it honestly. */
export interface PinApplyResult {
    readonly pin: RenderQualityPin;
    /** The tier the automatic policy holds — what the pin is overriding. */
    readonly automaticTier: SceneQualityTier | undefined;
    /** The scene mesh count the re-apply used, or `undefined` if none has been seen yet. */
    readonly meshCount: number | undefined;
    /**
     * False when the coordinator was not reachable (no project open yet). The pin is still
     * SET and PERSISTED — it takes effect at the next tier evaluation — but nothing changed
     * on screen at this instant, and the caller must not claim otherwise.
     */
    readonly reapplied: boolean;
}

/**
 * Set the pin, persist it, and DRIVE IT ALL THE WAY TO THE RENDERER.
 *
 * The re-apply is the whole point. `setTierOverride` alone changes a decision service; the
 * shadow map, reflection probe and SSGI/TRAA hooks only move when
 * `applyTierForMeshCount()` runs — and that is driven by geometry events, which a settings
 * click is not. Re-driving it with the SAME inputs the manager last saw
 * (`lastMeshCount` / `lastIsWebGPU`) makes the change immediate, and makes `changed` true
 * (the coordinator early-returns on `!changed`, so re-applying with a stale tier would be
 * a no-op).
 *
 * Never throws: a settings toggle must not be able to kill the panel.
 */
export function applyRenderQualityPin(
    pin: RenderQualityPin,
    coordinator: TierApplier | null | undefined,
): PinApplyResult {
    return withPinSpan('apply', { 'pryzm.render_quality.pin': pin }, () => {
        sceneQualityTierManager.setTierOverride(pin === 'auto' ? null : pin);
        setRenderQualityPin(pin);

        const meshCount = sceneQualityTierManager.lastMeshCount;
        const automaticTier = sceneQualityTierManager.automaticTier;

        let reapplied = false;
        if (typeof coordinator?.applyTierForMeshCount === 'function' && meshCount !== undefined) {
            try {
                coordinator.applyTierForMeshCount(meshCount, sceneQualityTierManager.lastIsWebGPU);
                reapplied = true;
            } catch (err) {
                console.warn('[renderQualityPin] §RENDER-QUALITY-USER-PIN re-apply failed (non-fatal):', err);
            }
        }

        console.log(
            `[renderQualityPin] §RENDER-QUALITY-USER-PIN (L-1512) — pin="${pin}" `
            + `(automatic tier would be "${automaticTier ?? 'none yet'}" at ${meshCount ?? '?'} meshes); `
            + `${reapplied ? 'applied to the live renderer now' : 'NOT applied yet — no live scene tier to re-drive'}.`,
        );
        return { pin, automaticTier, meshCount, reapplied };
    });
}

/** Ordered cheapest → richest, so a caller can tell "richer than automatic" from "cheaper". */
const TIER_RICHNESS: readonly SceneQualityTier[] = ['survival', 'performance', 'balanced', 'cinematic'];

/**
 * Is `pin` RICHER than what the automatic policy chose?
 *
 * The UI must say so out loud when it is. A control that silently outranks a documented
 * cap is how "the app got slower" arrives six weeks later with no cause attached — the
 * founder must be able to attribute a stutter to the choice he made.
 */
export function pinIsRicherThanAutomatic(
    pin: RenderQualityPin,
    automaticTier: SceneQualityTier | undefined,
): boolean {
    return withPinSpan(
        'is-richer',
        { 'pryzm.render_quality.pin': pin, 'pryzm.render_quality.automatic': automaticTier ?? 'none' },
        () => {
            if (pin === 'auto' || automaticTier === undefined) return false;
            return TIER_RICHNESS.indexOf(pin) > TIER_RICHNESS.indexOf(automaticTier);
        },
    );
}
