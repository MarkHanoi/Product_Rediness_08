/**
 * @file JSONRepair.ts
 * @description Lightweight JSON repair utility for truncated Claude API responses.
 *
 * Used exclusively by FloorPlanAIFactory when the model hits max_tokens mid-object.
 * Zero dependencies. Zero side-effects.
 *
 * Strategy:
 *  1. Try raw JSON.parse() — fast path for valid responses.
 *  2. Strip Markdown code fences (``` json ... ```) if present.
 *  3. Attempt bracket-completion: track the open bracket/brace stack,
 *     remove any trailing comma, then close all open containers in
 *     reverse order. This recovers truncated arrays of objects.
 *  4. Return null if all strategies fail — caller must handle gracefully.
 */

/**
 * Attempt to parse potentially truncated JSON.
 *
 * @param raw   Raw string from Claude (may be truncated, may have markdown fences).
 * @param label Debug label for console logging.
 * @returns     Parsed value, or null if unrecoverable.
 */
export function repairAndParseJSON(raw: string, label: string): any {
    // ── 1. Strip markdown code fences ────────────────────────────────────────
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // ── 2. Fast path: valid JSON ──────────────────────────────────────────────
    try {
        return JSON.parse(stripped);
    } catch {
        /* fall through to repair */
    }

    // ── 3. Bracket-completion repair ──────────────────────────────────────────
    const repaired = completeTruncatedJSON(stripped);
    if (repaired !== null) {
        console.warn(
            `[JSONRepair] "${label}" response was truncated — recovered partial result. ` +
            `Original length: ${raw.length}, repaired length: ${repaired.length}.`
        );
        try {
            return JSON.parse(repaired);
        } catch (e) {
            console.error(`[JSONRepair] Repair attempt failed for "${label}":`, e, '\nRepaired string:\n', repaired.slice(0, 400));
        }
    }

    // ── 4. Unrecoverable ──────────────────────────────────────────────────────
    console.error(`[JSONRepair] Cannot recover "${label}" JSON. Raw (first 400 chars):`, raw.slice(0, 400));
    return null;
}

/**
 * Given a truncated JSON string, attempt to close all open brackets/braces
 * and return a syntactically valid JSON string, or null if the heuristic fails.
 *
 * Handles strings with escaped characters correctly so brackets inside string
 * values don't confuse the stack.
 */
function completeTruncatedJSON(s: string): string | null {
    const stack: string[] = [];
    let inString = false;
    let escape = false;

    for (let i = 0; i < s.length; i++) {
        const c = s[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (c === '\\' && inString) {
            escape = true;
            continue;
        }

        if (c === '"') {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (c === '{') { stack.push('}'); continue; }
        if (c === '[') { stack.push(']'); continue; }

        if (c === '}' || c === ']') {
            if (stack.length === 0) return null; // mismatched — unrecoverable
            stack.pop();
        }
    }

    if (stack.length === 0) {
        // Already balanced — but JSON.parse failed, so it's invalid for another reason
        return null;
    }

    // Remove trailing comma / whitespace before we close the containers
    // e.g. `..., ` → `...` so we don't produce `[{...},]`
    let trimmed = s.trimEnd();
    // Strip trailing comma, colon, or incomplete partial key/value
    trimmed = trimmed.replace(/[,:\s]+$/, '');

    // If we're still inside a string (e.g. truncated mid-key or mid-value), close it
    if (inString) {
        trimmed += '"';
    }

    // Remove a dangling property key — a complete string `"key"` at the end of an object
    // with no colon+value following it. This happens when truncation occurs right after a
    // property name (e.g. `..."confidence"` with the `: "high"` cut off).
    // After closing an open string above we may also have a freshly closed dangling key.
    if (stack.length > 0 && stack[stack.length - 1] === '}') {
        trimmed = trimmed.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*$/, '');
    }

    // Close all open containers
    const closers = stack.reverse().join('');
    return trimmed + closers;
}
