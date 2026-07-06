/**
 * @file packages/core-app-model/src/rendering/SharedMaterialCache.ts
 *
 * SharedMaterialCache — §PERF-INSTANCE-MATERIAL-DEDUP (L-131 P6, 2026-07-06).
 *
 * ONE canonical THREE.Material per VISUAL signature, so GPU instancing actually
 * collapses draw calls at scale (80-apartment building = thousands of elements).
 *
 * ## The problem it fixes
 *
 * InstancedElementRenderer groups instances by `_hashGeometry(geo, material, level)`
 * whose key includes `material.uuid`. Element builders that mint a FRESH material
 * per element (ColumnFragmentBuilder / BeamFragmentBuilder / HandrailFragmentBuilder
 * / StairRailingBuilder / furniture leaves) therefore hand every element a UNIQUE
 * uuid → one InstanceGroup of size 1 each → instancing collapses NOTHING (N
 * elements = N draw calls). Walls already solved this locally with a colour-keyed
 * cache (§INSTANCE-MAT-SHARE in WallFragmentBuilder); this generalises the fix to
 * EVERY instanced element type at the single register() chokepoint.
 *
 * ## How
 *
 * {@link dedupInstanceMaterial} maps a material to the canonical instance for its
 * visual signature (from `materialInstanceSignature`, renderer-three). The FIRST
 * material seen for a signature becomes canonical and is returned as-is; every
 * later look-alike (a different object, identical appearance) is swapped for that
 * canonical instance. Same appearance → same uuid → ONE InstanceGroup → ONE draw
 * call per (geometry × look × level).
 *
 * ## Correctness / safety
 *
 * - Identical output: canonical and duplicate render the same (same signature).
 * - Genuinely-different materials get different signatures → never merged.
 * - Unrecognised / opted-out materials get `null` signature → returned unchanged
 *   (kept on their own uuid), so exotic / AI-tinted / in-place-mutated materials
 *   never bleed across elements.
 * - Per-element colour/PBR CHANGE: the builder re-runs and produces a material
 *   with a DIFFERENT signature → dedup returns a different canonical → the element
 *   re-keys into a different group WITHOUT recolouring others (register() already
 *   releases the element's old slot — §WALL-AUDIT-2026-W7).
 * - Selection/hover unaffected: instanced selection is a separate OBB/overlay
 *   highlight (§SELECT-INSTANCED-PICK), never a mutation of the base material.
 * - Disposal-safe: InstanceGroup.dispose() never disposes the material (it may be
 *   shared), so a canonical outliving one group is fine. {@link resetSharedMaterialCache}
 *   drops all references on project close (InstancedElementRenderer.clear()) so a
 *   builder that later disposes its own material cannot leave a dangling canonical.
 *
 * ## Flag — DEFAULT ON, revertible
 *
 * `globalThis.__pryzmInstanceMaterialDedup === false` disables dedup entirely:
 * every material is returned unchanged → EXACT pre-P6 behaviour. Any other value
 * (undefined / true) enables it.
 *
 * Contract compliance:
 *   P2 — THREE only via '@pryzm/renderer-three/three' (+ the pure signature helper).
 *   P8 — every exported function carries an OpenTelemetry span.
 *   §01-BIM-ENGINE-CORE §5 — projection-layer helper; no store reads/mutations.
 */

import type * as THREE from '@pryzm/renderer-three/three';
import { materialInstanceSignature } from '@pryzm/renderer-three';
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/core-app-model/shared-material-cache', '0.1.0');

function withCacheSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.shared-material.${verb}`, { attributes: attrs });
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

/** signature → canonical shared THREE.Material. Module-level (mirrors instancedElementRenderer). */
const _canonicalBySignature = new Map<string, THREE.Material>();

/**
 * True unless the dedup flag is explicitly disabled. DEFAULT ON: only
 * `globalThis.__pryzmInstanceMaterialDedup === false` turns it off (restoring
 * exact pre-P6 behaviour). Internal (not exported) to keep the hot register()
 * path free of an extra span per element.
 */
function _isDedupEnabled(): boolean {
    return (globalThis as { __pryzmInstanceMaterialDedup?: boolean })
        .__pryzmInstanceMaterialDedup !== false;
}

/**
 * Return the canonical shared material for `material`'s visual signature, or
 * `material` itself when: the flag is off, the material is not dedup-eligible
 * (null signature), or this is the first material seen for its signature (it
 * becomes the canonical). Idempotent — passing an already-canonical material
 * returns it unchanged.
 *
 * Called from InstancedElementRenderer.register() BEFORE the group key is hashed,
 * so same-look elements land in one InstanceGroup → one draw call.
 *
 * P8: `pryzm.shared-material.dedup` span.
 */
export function dedupInstanceMaterial(material: THREE.Material): THREE.Material {
    return withCacheSpan(
        'dedup',
        { 'pryzm.shared_material.type': material.type },
        () => {
            if (!_isDedupEnabled()) return material;

            const sig = materialInstanceSignature(material);
            // null → material must not be shared (exotic type / explicit opt-out).
            if (sig === null) return material;

            const existing = _canonicalBySignature.get(sig);
            if (existing) return existing;

            // First of its kind → this material becomes the canonical.
            _canonicalBySignature.set(sig, material);
            return material;
        },
    );
}

/**
 * Drop all canonical references. Call on project close (from
 * InstancedElementRenderer.clear()) so a canonical cannot outlive the scene and
 * be served after its builder disposes it. Does NOT dispose the materials — their
 * builders / InstanceGroups own disposal exactly as before (flag-off parity).
 *
 * P8: `pryzm.shared-material.reset` span.
 */
export function resetSharedMaterialCache(): void {
    withCacheSpan('reset', { 'pryzm.shared_material.count': _canonicalBySignature.size }, () => {
        _canonicalBySignature.clear();
    });
}

/**
 * Test/diagnostic: number of distinct canonical materials currently cached.
 *
 * P8: `pryzm.shared-material.size` span.
 */
export function sharedMaterialCacheSize(): number {
    return withCacheSpan('size', {}, () => _canonicalBySignature.size);
}
