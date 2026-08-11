/**
 * @file FPTiers.ts
 * §PDF-BIM-TIER-LADDER (2026-08-11, PDF-TO-BIM-AUDIT-2026-08-10 §7).
 *
 * The recognition ladder and the honest reporting of which rung ran.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * PDF-to-BIM used to have exactly one engine: the Claude vision relay. When
 * the relay is unreachable — which is the PRODUCTION state, since the deploy
 * carries neither CF_WORKER_URL nor ANTHROPIC_API_KEY — Step 4 answered every
 * upload with "AI service unavailable… ask the admin to set CF_WORKER_URL",
 * and the feature was simply dead.
 *
 * It is not dead. Two of the three rungs are DETERMINISTIC and need no key:
 *
 *   1. VECTOR  — decode the PDF's own line-work. Exact; the drawing's own
 *                geometry, not an estimate of it.
 *   2. RASTER  — classical CV over the rasterised page (@pryzm/ai-worker
 *                raster-cv). Works on scans and JPG/PNG. Approximate, and
 *                says so.
 *   3. AI      — the vision relay. Only when configured, and only as (a)
 *                enrichment the deterministic tiers do not cover (furniture,
 *                plumbing), or (b) the last resort when BOTH deterministic
 *                tiers found nothing.
 *
 * Walls, doors, windows and the floor slab therefore never depend on an API
 * key. Furniture and plumbing genuinely do — no deterministic tier classifies
 * them — and the wizard states that rather than implying the whole feature is
 * offline.
 */

import type { FPState } from './FPTypes';

// ── AI availability ───────────────────────────────────────────────────────

/**
 * §CONTEXT-DATA-HONESTY — three states, not two. "We asked and the server
 * said no upstream is configured" and "we could not ask" are different facts
 * and get different copy. Collapsing them is how a transient network blip
 * becomes a permanent, wrong "your admin must configure AI" message.
 */
export type AiAvailability = 'available' | 'unavailable' | 'unknown';

/** Session-scoped memo. Server AI config does not change mid-session, and the
 *  health route runs real DB queries — polling it per step would be rude. */
let aiAvailabilityCache: AiAvailability | null = null;

/** Forget the memo (used by Start Over, and by tests). */
export function resetAiAvailabilityCache(): void {
    aiAvailabilityCache = null;
}

/**
 * Ask the server whether an AI upstream is configured at all.
 *
 * `GET /api/health` reports `features.anthropic = !!(CF_WORKER_URL ||
 * ANTHROPIC_API_KEY)` (server.js). This is a CONFIGURATION probe, not a
 * liveness one: a configured relay can still fail per-request, which the
 * analysis path handles separately. Never throws.
 */
export async function probeAiAvailability(): Promise<AiAvailability> {
    if (aiAvailabilityCache) return aiAvailabilityCache;
    try {
        const resp = await fetch('/api/health', { method: 'GET' });
        if (!resp.ok) {
            aiAvailabilityCache = 'unknown';
            return aiAvailabilityCache;
        }
        const data = (await resp.json()) as { features?: { anthropic?: boolean } };
        const flag = data?.features?.anthropic;
        // A response whose shape we do not recognise is NOT evidence of absence.
        aiAvailabilityCache = typeof flag === 'boolean'
            ? (flag ? 'available' : 'unavailable')
            : 'unknown';
    } catch {
        aiAvailabilityCache = 'unknown';
    }
    return aiAvailabilityCache;
}

/** The sentence shown next to the disabled enrichment checkboxes. */
export function aiEnrichmentNote(availability: AiAvailability): string {
    switch (availability) {
        case 'available':
            return 'Furniture and plumbing are detected by the AI vision stage, which is configured on this deploy.';
        case 'unavailable':
            return 'Furniture and plumbing need the AI vision stage, and this deploy has no AI upstream configured '
                 + '(no CF_WORKER_URL / ANTHROPIC_API_KEY). Walls, doors, windows and the floor slab are NOT affected — '
                 + 'they are produced deterministically from the drawing.';
        case 'unknown':
            return 'Could not reach the server to check whether an AI upstream is configured, so furniture and plumbing '
                 + 'are unavailable for now. Walls, doors, windows and the floor slab are NOT affected — '
                 + 'they are produced deterministically from the drawing.';
    }
}

// ── Which deterministic tier will this file get? ──────────────────────────

export type PlannedTier = 'vector' | 'raster';

export interface TierPlan {
    readonly planned: PlannedTier;
    /** One sentence naming the tier and what it will and will not produce. */
    readonly note: string;
}

/**
 * Decide, BEFORE analysis, which deterministic tier this upload will get, and
 * say exactly what that tier does and does not produce.
 *
 * This is a plan, not a promise: the vector tier still self-rejects at run
 * time if it finds too few wall pairs, and the ladder falls through to raster.
 * The wizard reports what ACTUALLY ran afterwards.
 */
export function planTier(state: FPState): TierPlan {
    const conv = state.pdfConversion;
    const vec = conv?.vector ?? null;
    if (vec) {
        const ops = vec.ops as Record<string, number>;
        const pathCount = vec.fnArray.filter(fn => fn === ops['constructPath']).length;
        if (pathCount >= 8) {
            return {
                planned: 'vector',
                note: `Vector extraction (deterministic, no AI): ${pathCount} drawn paths on this page. `
                    + 'Produces walls, doors, windows and the floor slab from the drawing\'s own geometry. '
                    + 'Does not produce furniture or plumbing.',
            };
        }
        return {
            planned: 'raster',
            note: `Raster analysis (deterministic, no AI): only ${pathCount} drawn vector path`
                + `${pathCount === 1 ? '' : 's'} on this page, so this is a scanned or image-based plan. `
                + 'Walls, doors, windows and the floor slab are measured from the image — approximate, '
                + 'and lower confidence than a vector PDF. Does not produce furniture or plumbing.',
        };
    }
    if (conv?.sourceKind === 'pdf') {
        return {
            planned: 'raster',
            note: 'Raster analysis (deterministic, no AI): this PDF\'s vector content could not be read '
                + '(encrypted or damaged page), so the rendered image is analysed instead. '
                + 'Walls, doors, windows and the floor slab are approximate. No furniture or plumbing.',
        };
    }
    return {
        planned: 'raster',
        note: 'Raster analysis (deterministic, no AI): a JPG/PNG has no vector data to read, so the image '
            + 'itself is analysed. Walls, doors, windows and the floor slab are approximate. '
            + 'No furniture or plumbing.',
    };
}

// ── Raster decoding ───────────────────────────────────────────────────────

export interface DecodedRaster {
    readonly rgba: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
}

/**
 * Decode the wizard's already-rendered page image into raw RGBA for the CV
 * tier. Reuses the SAME raster the wizard shows the user and sends to the AI
 * relay, so what the user sees is what tier 2 measures.
 *
 * Returns null rather than throwing: a decode failure is a reason to report
 * "the image could not be read", not to abort the import.
 */
export async function decodeRasterForCv(
    base64: string,
    mimeType: string,
): Promise<DecodedRaster | null> {
    try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('image decode failed'));
            img.src = `data:${mimeType};base64,${base64}`;
        });
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (width === 0 || height === 0) return null;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        // Paint paper first: a transparent PNG composited onto a transparent
        // canvas reads as black, and the whole page binarizes to solid ink.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, width, height);
        return { rgba: data, width, height };
    } catch {
        return null;
    }
}
