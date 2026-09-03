/**
 * componentThumbnails — lane U5 (§COMPONENT-PREVIEW) · static per-definition
 * thumbnails for the Components browser cards.
 *
 * ─── ONE RIG, NOT A RIG PER CARD ───────────────────────────────────────────────
 * Draws through the SHARED `ElementPreviewRenderer` context (`requestPreviewDraw`)
 * — deliberately NOT the `FurnitureThumbnailService` pattern, whose dedicated
 * offscreen `WebGLRenderer` is the exact context-leak shape the element-preview
 * rig's header documents (browsers cap live contexts and evict the OLDEST — the
 * main viewport). A panel drawing N thumbnails still holds exactly one context,
 * and `holdComponentThumbnailRig()` lets that panel keep the rig warm for its
 * open lifetime instead of churning create/destroy per card.
 *
 * ─── CACHE ─────────────────────────────────────────────────────────────────────
 * Keyed `schemaHash : typeId : sizePx`. `schemaHash` is the loader's content hash
 * of the definition document, so the key changes exactly when the definition
 * does — no manual invalidation, and two loads of identical bytes share one
 * image. ⚠ Only DEFINITION-LEVEL outcomes are cached (a rendered image, or an
 * evaluation refusal — both deterministic per content). DRAW-level failures
 * (no-webgl / context-lost / no-2d-context) are transient rig states and are
 * NOT cached: caching one would freeze "the driver hiccuped" into "this
 * definition has no preview" for the session.
 *
 * P3: no loop — one coalesced draw per (cache-miss) thumbnail, then a blit to a
 * data URL. An idle browser panel costs zero frames.
 */

import {
    acquirePreviewMount,
    releasePreviewMount,
    requestPreviewDraw,
    DEFAULT_ORBIT,
    type PreviewDrawResult,
} from '../element-preview/ElementPreviewRenderer';
import {
    buildComponentPreviewSubject,
    type ComponentPreviewRequest,
    type ComponentPreviewRefused,
} from './componentPreviewSubject';

export type ComponentThumbnailResult =
    | { readonly ok: true; readonly url: string; readonly partial: boolean }
    | {
          readonly ok: false;
          /** The subject builder's typed reason, or the renderer's draw outcome. */
          readonly reason: ComponentPreviewRefused['reason'] | Exclude<PreviewDrawResult, 'ok'>;
          readonly message: string;
      };

const DEFAULT_SIZE_PX = 96;

/** Definition-level outcomes only — see header. */
const cache = new Map<string, ComponentThumbnailResult>();

/** Test seam. */
export function _clearComponentThumbnailCacheForTest(): void {
    cache.clear();
}

/**
 * Keep the shared preview context alive across a batch of thumbnail draws (e.g.
 * for the lifetime of an open browser panel). Returns the release function; call
 * it exactly once. Without a hold, sequential cache-miss draws would each
 * create-and-destroy the shared WebGL context.
 */
export function holdComponentThumbnailRig(): () => void {
    acquirePreviewMount();
    let released = false;
    return () => {
        if (released) return;
        released = true;
        releasePreviewMount();
    };
}

/**
 * Render (or serve from cache) a thumbnail for `(definition, type)`.
 *
 * The honest outcomes are three, and they are distinguishable: an image, a
 * definition that cannot evaluate (typed reason + the evaluator's sentence,
 * cached), and a rig that cannot draw right now (typed draw outcome, NOT
 * cached).
 */
export async function getComponentThumbnail(
    req: ComponentPreviewRequest,
    sizePx: number = DEFAULT_SIZE_PX,
): Promise<ComponentThumbnailResult> {
    const key = `${req.family.schemaHash}:${req.typeId ?? '(no-type)'}:${sizePx}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    const built = await buildComponentPreviewSubject(req);
    if (!built.ok) {
        const out: ComponentThumbnailResult = {
            ok: false,
            reason: built.reason,
            message: built.message,
        };
        cache.set(key, out); // deterministic per schemaHash — cacheable
        return out;
    }

    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;

    const release = holdComponentThumbnailRig();
    try {
        const drawn = await new Promise<PreviewDrawResult>((resolve) => {
            requestPreviewDraw(built.subject, canvas, { ...DEFAULT_ORBIT }, resolve);
        });
        if (drawn !== 'ok') {
            // Transient rig state — reported, never cached (see header).
            return {
                ok: false,
                reason: drawn,
                message: `The shared preview context could not draw this thumbnail (${drawn}).`,
            };
        }
        const url = canvas.toDataURL('image/png');
        const out: ComponentThumbnailResult = {
            ok: true,
            url,
            partial: built.unsupported.length > 0,
        };
        cache.set(key, out);
        return out;
    } finally {
        release();
    }
}
