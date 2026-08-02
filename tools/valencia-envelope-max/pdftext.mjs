// ⛔ THE CLASSIFIER THE PRIOR PROBE USED IS WRONG, AND THIS FILE IS THE CORRECTION.
//
// The prior probe classified a PDF as born-digital iff it contained an EMBEDDED FONT PROGRAM
// (`/FontFile*`), reasoning — correctly — that per ISO 32000-1 §7.5.7 a stream object can never
// live inside an `/ObjStm`, so that signal is always visible in raw bytes.
//
// The signal is visible. It is just NOT THE RIGHT SIGNAL.
//
// MEASURED COUNTER-EXAMPLE, opened in full, not inferred:
//   `12135-1111 Memoria y Normas_.pdf` — 809,302 bytes, downloaded whole.
//     /FontFile     0 occurrences in the ENTIRE file (not merely outside a 512 KB head)
//     /Type /Font   0 occurrences   ← the font DICTS are plain objects, so they ARE hidden,
//                                     inside this file's 15 /ObjStm object streams
//     scan codecs   4
//   …and poppler extracts 32,121 characters over 21 pages of real ordinance prose.
//
// Two independent things defeat the font test at once: fonts may be NON-EMBEDDED (base-14
// Helvetica/Times referenced by name — nothing to embed), and font dictionaries, being plain
// objects rather than streams, are exactly the kind of object that CAN be compressed into an
// object stream and vanish from a byte scan. `/FontFile > 0` is sufficient for born-digital;
// it is NOT NECESSARY, and the prior probe used it as if it were. Its SCAN counts are therefore
// biased UPWARD by an unmeasured amount.
//
// ⭐ THE RIGHT SIGNAL IS THE CONTENT STREAM. Text is painted by the text-showing operators
// Tj / TJ / ' / " inside a page content stream. A content stream IS a stream, so §7.5.7 applies
// in the direction that helps: it can never hide in an /ObjStm. Inflate it and the text layer
// is either there or it is not. That is decisive, and it is what this module does.
import zlib from 'node:zlib';

/**
 * Inflate tolerantly. A 512 KB Range head TRUNCATES the last stream mid-way, and a strict
 * inflate throws on truncated input, discarding everything decoded so far. Z_SYNC_FLUSH keeps
 * the partial output — which is the whole point when reading a head.
 */
function inflateLoose(buf) {
    for (const fn of [zlib.inflateSync, zlib.inflateRawSync]) {
        try { return fn(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch { /* try next */ }
    }
    return null;
}

/** Characters shown by Tj / TJ / ' / " in an inflated content stream. */
function textCharsIn(s) {
    let n = 0;
    // (literal string) Tj|'|"    and   [ (a) -250 (b) ] TJ
    for (const m of s.matchAll(/\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")/g)) n += m[1].replace(/\\./g, 'x').length;
    for (const m of s.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ/g)) {
        for (const p of m[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)) n += p[1].replace(/\\./g, 'x').length;
    }
    // hex strings <...> Tj — used by subsetted/CID fonts
    for (const m of s.matchAll(/<([0-9A-Fa-f\s]{4,})>\s*(?:Tj|TJ|'|")/g)) n += Math.floor(m[1].replace(/\s/g, '').length / 4);
    return n;
}

/**
 * Scan a PDF buffer (whole file OR a Range head) for painted text.
 * Returns { textChars, streamsSeen, streamsInflated }.
 */
export function textLayer(buf) {
    const s = buf.toString('latin1');
    let textChars = 0, streamsSeen = 0, streamsInflated = 0;
    const re = /stream\r?\n/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        streamsSeen++;
        const start = m.index + m[0].length;
        const endIdx = s.indexOf('endstream', start);
        const end = endIdx === -1 ? s.length : endIdx;      // truncated head → take what is there
        if (end - start < 8) continue;
        const dict = s.slice(Math.max(0, m.index - 700), m.index);
        if (/\/Subtype\s*\/Image|\/DCTDecode|\/JPXDecode|\/JBIG2Decode|\/CCITTFaxDecode/.test(dict)) continue;
        const raw = buf.slice(start, end);
        let body;
        if (/\/FlateDecode/.test(dict)) { body = inflateLoose(raw); if (body) streamsInflated++; }
        else if (!/\/Filter/.test(dict)) body = raw;         // uncompressed content stream
        if (!body) continue;
        textChars += textCharsIn(body.toString('latin1'));
        if (textChars > 200000) break;                       // enough; stop burning CPU
    }
    return { textChars, streamsSeen, streamsInflated };
}
