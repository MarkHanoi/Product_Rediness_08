// compressCodec.ts — §PERF-COMPRESS-WORKER (L-131 P4a)
//
// Single source of truth for the per-snapshot DEFLATE codec shared by the
// MAIN-THREAD save path (ProjectRepository) and the OFF-MAIN-THREAD compression
// worker (compress.worker.ts). Keeping the encode/decode in one module
// GUARANTEES byte-format identity: `encodeCompressed(json)` produces the exact
// same string whether it runs on the main thread (synchronous fallback) or
// inside the worker — so a payload compressed by the worker inflates through the
// identical main-thread read path, and vice-versa.
//
// Byte format (UNCHANGED from the original ProjectRepository implementation, so
// every previously-saved project still inflates):
//   DEFLATE (fflate, level 1) → Uint8Array → chunked base64 → COMPRESSED_MARKER prefix.
//
// This module is PURE: fflate + btoa/atob only. No DOM, no THREE, no rAF — it is
// safe to import from both a DedicatedWorkerGlobalScope and the main thread.

import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';

/**
 * Marker prefixing every compressed entry so the read path can distinguish
 * legacy uncompressed JSON from compressed data. IDENTICAL to the value the
 * original ProjectRepository used — do NOT change it or old saves stop reading.
 */
export const COMPRESSED_MARKER = '\x00fflate\x01';

/** Convert Uint8Array → base64 string, chunked to avoid call-stack overflow. */
function _uint8ToBase64(bytes: Uint8Array): string {
    const CHUNK = 8192;
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
        parts.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
    }
    return btoa(parts.join(''));
}

/**
 * Compress a JSON string → marked compressed string. Falls back to raw on error.
 *
 * level 1 ("fastest"): single-pass LZ77 with no lazy matching — ~31× faster than
 * the zlib default (level 6) at +4–6% size. The inflate path is O(output)
 * regardless of encode level. This is the SAME encode the original main-thread
 * `_compressJSON` performed; it now lives here so the worker can call it too.
 */
export function encodeCompressed(json: string): string {
    try {
        const compressed = deflateSync(strToU8(json), { level: 1 });
        return COMPRESSED_MARKER + _uint8ToBase64(compressed);
    } catch (err) {
        console.warn('[compressCodec] compression failed — returning raw JSON:', err);
        return json;
    }
}

/**
 * Decompress a string produced by {@link encodeCompressed}.
 * If the string lacks the marker (legacy uncompressed / raw), returns it as-is.
 */
export function decodeCompressed(data: string): string {
    if (!data.startsWith(COMPRESSED_MARKER)) return data;
    try {
        const b64 = data.slice(COMPRESSED_MARKER.length);
        const binaryStr = atob(b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        return strFromU8(inflateSync(bytes));
    } catch (err) {
        console.warn('[compressCodec] decompression failed — returning raw:', err);
        return data;
    }
}

// ── Worker message contract (shared shape for pool ↔ worker) ─────────────────

/** One compression job: `key` echoes back with its compressed `blob`. */
export interface CompressItem {
    key: string;
    json: string;
}

/** Request posted to the compression worker. */
export interface CompressWorkerRequest {
    requestId: string;
    items: CompressItem[];
}

/** Result posted back by the compression worker. */
export interface CompressWorkerResult {
    requestId: string;
    /** Present on a successful compress: `key` → compressed blob string. */
    results?: { key: string; blob: string }[];
    /** Present when the worker threw — the pool rejects and the caller falls back. */
    error?: string;
    /** One-time handshake posted at worker startup so the pool knows it is live. */
    ready?: boolean;
}

/** The requestId used by the worker's startup handshake message. */
export const COMPRESS_WORKER_READY_ID = '__compress_ready__';
