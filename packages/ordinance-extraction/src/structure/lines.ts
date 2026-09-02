// @pryzm/ordinance-extraction — LAYER 3, step 1: positioned items → LINES.
//
// Pure geometry. `joinPdfTextItems` (Layer 2) answers "what does this PAGE say";
// this answers "what runs share a baseline, and where does each one START" — the
// second question is the one a grid needs and the first one throws away.

import { type PdfTextItemLike } from '../ingest/pdfItems.js';
import {
    DEFAULT_LAYOUT_OPTIONS,
    type LayoutLine,
    type LayoutOptions,
    type PositionedItem,
} from './types.js';

/**
 * Resolve pdf.js text items into positioned items, dropping whitespace-only runs
 * (they carry no text and their x would invent a phantom column anchor).
 */
export function toPositionedItems(items: readonly PdfTextItemLike[]): PositionedItem[] {
    const out: PositionedItem[] = [];
    for (const it of items) {
        const text = it.str ?? '';
        if (text.trim() === '') continue;
        const t = it.transform;
        if (!t || t.length < 6) continue;
        out.push({
            text,
            x: t[4] as number,
            y: t[5] as number,
            width: it.width ?? 0,
            height: it.height ?? 0,
        });
    }
    return out;
}

/**
 * Join a run of items that share a baseline into text, inserting a space where the
 * horizontal gap exceeds `spaceGapRatio x` the mean glyph width.
 *
 * ⚠ NOT a rival of `joinPdfTextItems`: that one owns the PAGE (line breaks, the
 * double-newline guard, `hasEOL`), which is exactly what must NOT happen inside a
 * table CELL. This one only ever sees items already known to be co-linear. The
 * space rule is deliberately the same rule and the same default, so a cell's text
 * and the page's text never disagree about where a word begins.
 */
export function joinItemsOnLine(
    items: readonly PositionedItem[],
    spaceGapRatio: number = DEFAULT_LAYOUT_OPTIONS.spaceGapRatio,
): string {
    let out = '';
    let prevEndX: number | null = null;
    for (const item of items) {
        if (out !== '' && prevEndX !== null) {
            const gap = item.x - prevEndX;
            const glyph = item.text.length > 0 && item.width > 0 ? item.width / item.text.length : 0;
            const threshold = glyph > 0 ? glyph * spaceGapRatio : 1;
            // Never open a gap before punctuation that binds to the word before it:
            // a wrapped remarks cell reassembled as "Gestaltungsplanpflicht , Art. 7"
            // is a worse rendering of a legal qualifier than the source deserves.
            const bindsLeft = /^[,;:.!?)\]}%]/u.test(item.text);
            if (gap > threshold && !bindsLeft && !/\s$/.test(out) && !/^\s/.test(item.text)) {
                out += ' ';
            }
        }
        out += item.text;
        prevEndX = item.x + item.width;
    }
    return out.trim();
}

/**
 * Group one page's items into lines by baseline, top of page first.
 *
 * Clustering is greedy over y-sorted items with a fixed tolerance rather than a
 * k-means style fit: a fixed, published tolerance is auditable and reproducible,
 * and an adaptive fit would silently change how a document reads between runs.
 */
export function buildLines(
    pageNumber: number,
    items: readonly PositionedItem[],
    options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS,
): LayoutLine[] {
    if (items.length === 0) return [];
    // Descending y == top of the page first (PDF origin is bottom-left).
    const sorted = [...items].sort((a, b) => b.y - a.y);

    const groups: PositionedItem[][] = [];
    let current: PositionedItem[] = [sorted[0]!];
    let anchorY = sorted[0]!.y;
    for (let i = 1; i < sorted.length; i++) {
        const it = sorted[i]!;
        if (Math.abs(it.y - anchorY) <= options.lineTolerance) {
            current.push(it);
        } else {
            groups.push(current);
            current = [it];
            anchorY = it.y;
        }
    }
    groups.push(current);

    return groups.map((g) => {
        const ordered = [...g].sort((a, b) => a.x - b.x);
        const first = ordered[0]!;
        const last = ordered[ordered.length - 1]!;
        return {
            pageNumber,
            y: g.reduce((s, i) => s + i.y, 0) / g.length,
            items: ordered,
            text: joinItemsOnLine(ordered, options.spaceGapRatio),
            minX: first.x,
            maxX: last.x + last.width,
            maxHeight: ordered.reduce((m, i) => Math.max(m, i.height), 0),
        };
    });
}
