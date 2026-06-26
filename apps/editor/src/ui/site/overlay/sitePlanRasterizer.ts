// §SITE-PLAN-OVERLAY (rasteriser) — browser PDF/image → SIZE-CAPPED raster data URL for
// the site overlay. Impure (canvas + pdfjs + Image) but EVERY path is guarded so a bad
// file fails with a thrown Error the caller turns into a toast — it never crashes the
// renderer. The size cap (BOTH dimensions, via the pure computeCappedSize) is the fix for
// the legacy link-then-crash bug: a tall plan can no longer produce an over-limit raster.
//
// P2/P5 untouched: no THREE, no schema. pdfjs is lazy-imported (vendor-pdfjs chunk) so it
// only downloads when the user picks a PDF.

import { computeCappedSize, SAFE_MAX_TEXTURE_DIM } from './rasterSizeCap';
import { getMaxTextureDimension } from './deviceTextureLimit';

export interface RasterizedOverlay {
    /** The rasterised page/image as an `image/png` data URL (size-capped). */
    readonly dataUrl: string;
    /** Final (capped) width in pixels. */
    readonly widthPx: number;
    /** Final (capped) height in pixels. */
    readonly heightPx: number;
    /** Number of pages (1 for images). */
    readonly pageCount: number;
    /** The 1-based page that was rasterised. */
    readonly page: number;
}

export type OverlaySourceKind = 'pdf' | 'image';

/** Classify an uploaded file. Returns null for unsupported types. */
export function classifyOverlayFile(file: File): OverlaySourceKind | null {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
    if (/\.(png|jpe?g|webp|gif|bmp)$/.test(name) || file.type.startsWith('image/')) return 'image';
    return null;
}

/**
 * Probe how many pages a PDF has (so the UI can offer a page picker). Returns 1 for
 * images. Guarded — returns 1 on any parse failure rather than throwing.
 */
export async function probePageCount(file: File, kind: OverlaySourceKind): Promise<number> {
    if (kind === 'image') return 1;
    try {
        const pdfjsLib = await import('pdfjs-dist');
        ensureWorker(pdfjsLib);
        const buf = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const n = pdf.numPages;
        await pdf.destroy?.();
        return Number.isFinite(n) && n > 0 ? n : 1;
    } catch {
        return 1;
    }
}

/**
 * Rasterise a PDF page (1-based) OR an image file to a size-capped PNG data URL.
 *
 * The cap uses the smaller of the device's reported max texture dimension and our
 * conservative SAFE_MAX_TEXTURE_DIM, applied to BOTH dimensions, so the result is always
 * uploadable / decodable without risking a GPU device-lost. PDFs are first measured at
 * scale 1, then rendered at the scale that fits the cap (never above 2× for sharpness).
 *
 * @throws Error (caller → toast) on an unreadable / corrupt / empty source.
 */
export async function rasterizeOverlaySource(
    file: File,
    kind: OverlaySourceKind,
    page = 1,
): Promise<RasterizedOverlay> {
    const deviceMax = getMaxTextureDimension();
    return kind === 'pdf'
        ? rasterizePdf(file, page, deviceMax)
        : rasterizeImage(file, deviceMax);
}

// ── PDF path ──────────────────────────────────────────────────────────────────

async function rasterizePdf(file: File, page: number, deviceMax: number): Promise<RasterizedOverlay> {
    const pdfjsLib = await import('pdfjs-dist');
    ensureWorker(pdfjsLib);

    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    try {
        const pageCount = pdf.numPages;
        const pageNum = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
        const pg = await pdf.getPage(pageNum);

        const base = pg.getViewport({ scale: 1 });
        // Choose a render scale that (a) is sharp (≤ 2×) and (b) keeps BOTH rendered
        // dimensions within the cap so we never build an over-limit canvas in the first
        // place (the legacy bug rendered at full height then relied on a downstream cap
        // that did not exist).
        const cap = Math.max(1, Math.min(SAFE_MAX_TEXTURE_DIM, deviceMax || Number.POSITIVE_INFINITY));
        const fitScale = Math.min(cap / base.width, cap / base.height);
        const renderScale = Math.max(0.05, Math.min(2, fitScale));
        const vp = pg.getViewport({ scale: renderScale });

        // Final defensive cap (rounding / odd aspect) via the pure helper.
        const capped = computeCappedSize({ srcWidth: vp.width, srcHeight: vp.height, deviceMaxDim: deviceMax });

        const canvas = document.createElement('canvas');
        canvas.width = capped.width;
        canvas.height = capped.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2D canvas context unavailable.');
        // Render at the (already cap-fitted) viewport; if computeCappedSize trimmed a few
        // px, scale the context so the page still fills the canvas.
        if (capped.width !== Math.round(vp.width) || capped.height !== Math.round(vp.height)) {
            ctx.scale(capped.width / vp.width, capped.height / vp.height);
        }
        // pdfjs RenderParameters shape varies across minor versions (some require a
        // `canvas` field alongside `canvasContext`). Supply both and widen the type so the
        // dynamic-import resolution accepts it regardless.
        const renderParams = { canvasContext: ctx, canvas, viewport: vp } as unknown as Parameters<typeof pg.render>[0];
        await pg.render(renderParams).promise;

        const dataUrl = canvas.toDataURL('image/png');
        if (!dataUrl || dataUrl.length < 64) throw new Error('PDF page produced an empty image.');

        return { dataUrl, widthPx: capped.width, heightPx: capped.height, pageCount, page: pageNum };
    } finally {
        await pdf.destroy?.();
    }
}

// ── image path ──────────────────────────────────────────────────────────────

async function rasterizeImage(file: File, deviceMax: number): Promise<RasterizedOverlay> {
    const objectUrl = URL.createObjectURL(file);
    try {
        const img = await loadImage(objectUrl);
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        if (!srcW || !srcH) throw new Error('Image has zero dimensions — the file may be corrupt.');

        const capped = computeCappedSize({ srcWidth: srcW, srcHeight: srcH, deviceMaxDim: deviceMax });
        const canvas = document.createElement('canvas');
        canvas.width = capped.width;
        canvas.height = capped.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2D canvas context unavailable.');
        ctx.drawImage(img, 0, 0, capped.width, capped.height);

        const dataUrl = canvas.toDataURL('image/png');
        if (!dataUrl || dataUrl.length < 64) throw new Error('Image produced an empty raster.');
        return { dataUrl, widthPx: capped.width, heightPx: capped.height, pageCount: 1, page: 1 };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

// ── shared ────────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode the image file.'));
        img.src = src;
    });
}

let _workerSet = false;
function ensureWorker(pdfjsLib: typeof import('pdfjs-dist')): void {
    if (_workerSet) return;
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.mjs',
            import.meta.url,
        ).toString();
        _workerSet = true;
    } catch {
        /* worker URL resolution differs across bundlers — pdfjs falls back to fake worker */
    }
}
