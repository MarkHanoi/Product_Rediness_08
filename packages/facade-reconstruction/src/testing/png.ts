// C108 §7.1 / §8.3 — PNG encode + decode on Node's BUILT-IN zlib. ZERO dependencies.
//
// ── WHY THIS FILE EXISTS RATHER THAN A DEPENDENCY ───────────────────────────
// Brief §20 makes a licence audit a PRECONDITION for adding anything, and it names
// the model-weight licence specifically because that is the row that is usually
// missing. The cheapest way to pass that audit is to have nothing to audit.
//
// A PNG is a zlib stream of filtered scanlines. Node ships zlib. So the CLI can read
// a photograph the founder drops into the repo, and write every brief §18 diagnostic
// overlay as a lookable image, for about 150 lines and no new package — instead of
// `sharp` (bundles libvips, LGPL-2.1+) or `node-canvas` (bundles Cairo, LGPL) and
// their native binaries in CI.
//
// ⚠ PNG ONLY (L-11003, stated not discovered). JPEG is a wholly different animal —
// DCT, Huffman, chroma subsampling — and the BROWSER path already decodes JPEG,
// WebP, AVIF and HEIC for free (C108 §8.3). Re-saving one file as PNG is a smaller
// cost than a baseline-JPEG decoder nobody will maintain.
//
// ⛔ This module is the ONLY place in the package that touches `node:zlib`, and it
// lives under `testing/` rather than `reconstruction/` for that reason: the ENGINE
// stays I/O-free and platform-free (C108 §5.3).

import { deflateSync, inflateSync } from 'node:zlib';

import type { RasterImage } from '../contracts/RasterImage.js';

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ── CRC-32, as PNG specifies it ─────────────────────────────────────────────
const CRC_TABLE = (((): Uint32Array => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
}))();

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const forCrc = out.subarray(4, 8 + data.length);
    view.setUint32(8 + data.length, crc32(forCrc));
    return out;
}

/** Encode RGBA8 as a non-interlaced PNG (colour type 6, filter 0 per scanline). */
export function encodePng(image: RasterImage): Uint8Array {
    const { width, height, data } = image;
    const raw = new Uint8Array(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        const dst = y * (1 + width * 4);
        raw[dst] = 0; // filter: none — simple, and the deflate does the real work
        raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), dst + 1);
    }
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width);
    dv.setUint32(4, height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type: RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const idat = new Uint8Array(deflateSync(Buffer.from(raw)));
    const parts = [
        PNG_SIGNATURE,
        chunk('IHDR', ihdr),
        chunk('IDAT', idat),
        chunk('IEND', new Uint8Array(0)),
    ];
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}

function paeth(a: number, b: number, c: number): number {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
}

/**
 * Decode a non-interlaced 8-bit PNG (colour types 0, 2, 4 and 6) to RGBA.
 *
 * ⛔ Refuses with a NAMED reason rather than returning a plausible wrong image:
 * a 16-bit, palettised or interlaced PNG is a real file that this decoder cannot
 * read, and silently producing garbage from it would send the pipeline off to
 * measure noise. "I cannot read this" is the correct answer (C108 §0.3).
 */
export function decodePng(bytes: Uint8Array): RasterImage {
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('decodePng: not a PNG file');
    }
    let off = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colourType = 0;
    let interlace = 0;
    const idatParts: Uint8Array[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    while (off + 8 <= bytes.length) {
        const length = view.getUint32(off);
        const type = String.fromCharCode(bytes[off + 4]!, bytes[off + 5]!, bytes[off + 6]!, bytes[off + 7]!);
        const dataStart = off + 8;
        if (type === 'IHDR') {
            width = view.getUint32(dataStart);
            height = view.getUint32(dataStart + 4);
            bitDepth = bytes[dataStart + 8]!;
            colourType = bytes[dataStart + 9]!;
            interlace = bytes[dataStart + 12]!;
        } else if (type === 'IDAT') {
            idatParts.push(bytes.subarray(dataStart, dataStart + length));
        } else if (type === 'IEND') {
            break;
        }
        off = dataStart + length + 4;
    }

    if (bitDepth !== 8) {
        throw new Error(
            `decodePng: unsupported bit depth ${bitDepth} — this decoder reads 8-bit PNG only (L-11003). Re-save at 8 bits, or use the browser path.`,
        );
    }
    if (interlace !== 0) {
        throw new Error('decodePng: interlaced (Adam7) PNG is not supported (L-11003)');
    }
    const channels = colourType === 0 ? 1 : colourType === 2 ? 3 : colourType === 4 ? 2 : colourType === 6 ? 4 : 0;
    if (channels === 0) {
        throw new Error(
            `decodePng: unsupported colour type ${colourType} — grayscale/RGB/RGBA only, no palette (L-11003)`,
        );
    }
    if (width <= 0 || height <= 0) throw new Error('decodePng: missing or invalid IHDR');

    const totalLength = idatParts.reduce((a, p) => a + p.length, 0);
    const compressed = new Uint8Array(totalLength);
    let cOff = 0;
    for (const p of idatParts) {
        compressed.set(p, cOff);
        cOff += p.length;
    }
    const raw = new Uint8Array(inflateSync(Buffer.from(compressed)));

    const bpp = channels;
    const stride = width * bpp;
    const lines = new Uint8Array(height * stride);
    let src = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[src++]!;
        const cur = lines.subarray(y * stride, (y + 1) * stride);
        const prev = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;
        for (let i = 0; i < stride; i++) {
            const x = raw[src++]!;
            const a = i >= bpp ? cur[i - bpp]! : 0;
            const b = prev !== null ? prev[i]! : 0;
            const c = prev !== null && i >= bpp ? prev[i - bpp]! : 0;
            let value: number;
            switch (filter) {
                case 0:
                    value = x;
                    break;
                case 1:
                    value = x + a;
                    break;
                case 2:
                    value = x + b;
                    break;
                case 3:
                    value = x + ((a + b) >> 1);
                    break;
                case 4:
                    value = x + paeth(a, b, c);
                    break;
                default:
                    throw new Error(`decodePng: unknown scanline filter ${filter}`);
            }
            cur[i] = value & 0xff;
        }
    }

    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
        const s = i * bpp;
        if (channels === 1) {
            out[p] = lines[s]!;
            out[p + 1] = lines[s]!;
            out[p + 2] = lines[s]!;
            out[p + 3] = 255;
        } else if (channels === 2) {
            out[p] = lines[s]!;
            out[p + 1] = lines[s]!;
            out[p + 2] = lines[s]!;
            out[p + 3] = lines[s + 1]!;
        } else if (channels === 3) {
            out[p] = lines[s]!;
            out[p + 1] = lines[s + 1]!;
            out[p + 2] = lines[s + 2]!;
            out[p + 3] = 255;
        } else {
            out[p] = lines[s]!;
            out[p + 1] = lines[s + 1]!;
            out[p + 2] = lines[s + 2]!;
            out[p + 3] = lines[s + 3]!;
        }
    }
    return { width, height, data: out };
}
