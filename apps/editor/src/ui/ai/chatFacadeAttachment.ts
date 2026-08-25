/**
 * @file apps/editor/src/ui/ai/chatFacadeAttachment.ts
 *
 * §CHAT-ATTACH (L-10904..L-10908) — the PHOTOGRAPH the user attaches to a chat
 * message, from the file he picked to the brief the resolver reads.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE FOUNDER'S ASK, AND THE ONE THING THAT WAS MISSING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   attach a photo of a facade · type "create a residential building with the
 *   facade as per the image - 5 storey ... on the current boundary line" · get a
 *   building.
 *
 * EVERY PIECE OF THAT EXISTED except one: THE CHAT HAD NO FILE INPUT AT ALL.
 * `reconstructFacade()` (C108), `mapFacadeIRToPhotoBrief()` (L-11020),
 * `ResolverContext.photoFacade`, the provenance card and `generation.building`
 * were all live and connected to each other — and there was no way for a
 * photograph to enter the conversation. This file is that way in.
 *
 * ── ⛔ IT IS NOT A SECOND RECONSTRUCTION PIPELINE ────────────────────────────
 * It composes three things that already exist and adds NO measurement of its own:
 *
 *   1. `decodeImageFile()`      — apps/editor/src/ui/facade/facadeRaster.ts.
 *                                 The SAME decode the Façade Reconstruction panel
 *                                 uses, including its downscale cap and its
 *                                 named-reason failures.
 *   2. `reconstructFacade()`    — @pryzm/facade-reconstruction (L1). Classical CV,
 *                                 zero model inference, zero tokens.
 *   3. `mapFacadeIRToPhotoBrief()` — @pryzm/ai-host (L2). The ONE IR→brief mapping,
 *                                 which owns every threshold. ⛔ Nothing here may
 *                                 read a confidence, compare it to a floor, or
 *                                 decide what a photograph "shows": a client may
 *                                 not own a measurement rule.
 *
 * ── ⭐ THE JPEG QUESTION, ANSWERED BEFORE IT IS ASKED ────────────────────────
 * The reconstruction ENGINE ships a PNG-only decoder (`src/testing/png.ts`, Node
 * `zlib`) and the CLI is therefore PNG-only. That limit DOES NOT REACH THIS PATH,
 * and the founder photographs buildings with a phone:
 *
 *   `createImageBitmap()` decodes JPEG, PNG, WebP, AVIF and HEIC natively, and
 *   `ctx.getImageData()` IS a `RasterImage` field-for-field (C108 §5.3).
 *
 * So a phone photo needs no conversion and there is nothing to refuse. The right
 * answer to "should we refuse JPEG or convert it?" turned out to be "neither — the
 * browser already decoded it". Confirmed by reading `facadeRaster.ts` rather than
 * assuming the engine's limit propagated.
 *
 * ── WHY RECONSTRUCTION STARTS AT ATTACH TIME, NOT AT SEND ───────────────────
 * The Hough stage is hundreds of millions of accumulator increments and runs on
 * the main thread. Started on SEND, the founder types his sentence, presses Enter,
 * and the tab freezes. Started on ATTACH, it runs while he is still typing and is
 * almost always finished by the time he sends. The promise is cached, so `send`
 * awaits an already-settled value in the normal case and the SAME value if he
 * sends immediately.
 *
 * ⛔ NO GRAPHICS ARE TOUCHED. This module has no THREE import (P2), allocates no
 * GPU resource, and its only canvas is an offscreen 2-D one inside `decodeImageFile`
 * that is discarded after `getImageData`. The renderer never learns this ran.
 *
 * LAYERING — L7 (apps/editor) importing L2 (`@pryzm/ai-host`) and L1
 * (`@pryzm/facade-reconstruction`): both downward, both legal.
 */

import { reconstructFacade } from '@pryzm/facade-reconstruction';
import { mapFacadeIRToPhotoBrief, type FacadePhotoBrief } from '@pryzm/ai-host';

import { decodeImageFile, type DecodedImage } from '../facade/facadeRaster.js';

/**
 * What reading the photograph produced.
 *
 * ⚠ THREE STATES, NOT TWO. `ok:false` is "I could not read this file at all"
 * (an undecodable file, a refused canvas). A brief whose OWN `refusal` is set —
 * "I could not find the façade plane" — is `ok:true` here and refuses downstream,
 * because that is a MEASUREMENT and it belongs to the mapper, not to this file.
 * Collapsing the two would make "not an image" and "not a façade" the same
 * sentence, which is the §CONTEXT-DATA-HONESTY defect exactly.
 */
export type AttachmentReading =
    | { readonly ok: true; readonly brief: FacadePhotoBrief; readonly elapsedMs: number }
    | { readonly ok: false; readonly reason: string };

/** The photograph riding along with the NEXT message the user sends. */
export interface ChatAttachment {
    readonly file: File;
    readonly name: string;
    /** Bytes as delivered — shown on the chip so a 12 MP file is visibly a 12 MP file. */
    readonly sizeBytes: number;
    readonly decoded: DecodedImage;
    /** Object URL for the thumbnail. Revoked by `clearChatAttachment`. */
    readonly previewUrl: string;
    /**
     * ⭐ The reconstruction, started at ATTACH time. Awaited on send.
     * Never rejects — it settles to an `AttachmentReading`.
     */
    readonly reading: Promise<AttachmentReading>;
}

/**
 * ⚠ ONE ATTACHMENT, ONE PENDING MESSAGE. The chat panel is a singleton and a
 * message carries at most one photograph, so this is module state rather than a
 * class — the same shape the panel's own `conversation` state uses. A second
 * attach REPLACES the first and revokes its object URL, which is what "attach"
 * means in every chat client the founder has ever used.
 */
let pending: ChatAttachment | null = null;

/** The photograph currently riding with the next message, or `null`. */
export function getChatAttachment(): ChatAttachment | null {
    return pending;
}

/**
 * Drop the pending attachment and release its object URL.
 *
 * ⚠ THE REVOKE IS NOT HYGIENE — an object URL pins the whole decoded image in
 * memory for the life of the document, and a founder trying six photographs in a
 * row would pin all six. Idempotent: safe to call when nothing is attached.
 */
export function clearChatAttachment(): void {
    if (pending === null) return;
    try {
        URL.revokeObjectURL(pending.previewUrl);
    } catch (err) {
        // A revoke failure is not worth a user-visible error; it leaks one URL.
        console.warn('[chat-attach] revokeObjectURL failed (non-fatal):', err);
    }
    pending = null;
}

/** Files this path will attempt. Anything else is refused BY NAME (C74). */
function looksLikeImage(file: File): boolean {
    if (file.type.startsWith('image/')) return true;
    // Some platforms hand over an empty `type` for HEIC from the camera roll, so
    // fall back to the extension rather than refusing a real photograph on a
    // missing MIME string.
    return /\.(?:jpe?g|png|webp|avif|heic|heif|gif|bmp)$/i.test(file.name);
}

/**
 * Attach `file` to the next message: decode it, start the reconstruction, and
 * hold it until the user sends or removes it.
 *
 * ⛔ NEVER THROWS. Every failure comes back as a NAMED reason the chat can print
 * verbatim. A thrown error here would surface as "the quick command path hit an
 * error", which tells the user nothing about the file he just picked.
 */
export async function setChatAttachment(
    file: File,
): Promise<{ ok: true; attachment: ChatAttachment } | { ok: false; reason: string }> {
    if (!looksLikeImage(file)) {
        return {
            ok: false,
            reason:
                `"${file.name}" is not an image file (its type is "${file.type || 'unknown'}"), so there ` +
                'is no façade in it for me to read. Attach a JPEG, PNG, WebP, AVIF or HEIC photograph of ' +
                'the building front. A PDF or a CAD file is not an image — for a drawing, use the floor-plan ' +
                'import instead.',
        };
    }

    let decoded: DecodedImage;
    try {
        decoded = await decodeImageFile(file);
    } catch (err) {
        // `decodeImageFile` throws with a reason written for a human — forward it
        // rather than replacing it with a worse one.
        return { ok: false, reason: `I could not read that image: ${(err as Error).message}` };
    }

    // Replace any previous attachment (and release its URL) before taking the new one.
    clearChatAttachment();

    const previewUrl = URL.createObjectURL(file);
    const attachment: ChatAttachment = {
        file,
        name: file.name,
        sizeBytes: file.size,
        decoded,
        previewUrl,
        // ⭐ Started HERE, awaited on send. See the header for why.
        reading: runReconstruction(decoded),
    };
    pending = attachment;
    return { ok: true, attachment };
}

/**
 * Photograph → brief, through the two modules that own the measurement.
 *
 * ⛔ NO THRESHOLD, NO CONFIDENCE COMPARISON AND NO SEMANTIC LABEL APPEARS BELOW.
 * Every judgement is `mapFacadeIRToPhotoBrief`'s, so there is exactly one place
 * in the repository where a photograph becomes a building brief and exactly one
 * place to audit when a number looks wrong.
 */
async function runReconstruction(decoded: DecodedImage): Promise<AttachmentReading> {
    const started = Date.now();
    try {
        const result = await reconstructFacade(decoded.image);
        return {
            ok: true,
            brief: mapFacadeIRToPhotoBrief(result),
            elapsedMs: Date.now() - started,
        };
    } catch (err) {
        // C108 promises the pipeline never throws on a plausible image, so reaching
        // here means something structural. Say THAT, and do not present it as a
        // finding about the photograph.
        console.error('[chat-attach] reconstructFacade failed:', err);
        return {
            ok: false,
            reason:
                'the façade reader itself failed on that image — this is a fault in the reader, not ' +
                `something about your photo (${(err as Error).message}). Your sentence still works on ` +
                'its own: send it without the image and I will build from your words.',
        };
    }
}

/**
 * Take the pending attachment's reading for a message being sent, and clear it.
 *
 * ⭐ IT CLEARS EVEN WHEN THE READING FAILED, and that is the right call: the chip
 * disappearing is what tells the user his photograph was consumed by THAT message.
 * A chip that survives a send would silently ride along with the next sentence too.
 *
 * Returns `null` when nothing was attached — the caller then behaves exactly as it
 * did before this feature existed.
 */
export async function consumeChatAttachment(): Promise<
    { readonly attachment: ChatAttachment; readonly reading: AttachmentReading } | null
> {
    const att = pending;
    if (att === null) return null;
    const reading = await att.reading;
    clearChatAttachment();
    return { attachment: att, reading };
}

/**
 * One line describing what was attached, for the transcript.
 *
 * ⚠ IT NAMES THE DOWNSCALE. `decodeImageFile` caps the long side at 1 200 px, and
 * fine surface texture below the new Nyquist limit is genuinely gone. A user whose
 * 12 MP photograph was measured at 1 200 px is entitled to know that happened,
 * rather than discovering it from a reading that missed the detail he could see.
 */
export function describeAttachment(att: ChatAttachment): string {
    const kb = Math.round(att.sizeBytes / 1024);
    const src = `${att.decoded.sourceWidth}×${att.decoded.sourceHeight}`;
    const used = `${att.decoded.image.width}×${att.decoded.image.height}`;
    const scaled =
        att.decoded.scale < 1
            ? ` — read at ${used} (downscaled from ${src}; fine surface texture below that is lost)`
            : ` — read at full resolution (${used})`;
    return `📎 ${att.name}, ${kb} KB${scaled}`;
}
