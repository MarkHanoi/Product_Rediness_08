/**
 * AIResponseParser.ts — AI Response Parsing for Phase 3
 *
 * Phase 3 §3.1 (Ghost Preview) + §3.3 (Actionable Logs)
 *
 * CONTRACT COMPLIANCE:
 *   §01: Read-only. No store writes. No commandManager.execute().
 *   §04: Class A — new file. Purely additive.
 *   §03: Validates ElementSchema before passing to PreviewManager.
 *        Rejects malformed proposals without crashing.
 */

import type { QueryResult, AIElement } from './AITypes.js';
import type { ElementSchema } from './ElementSchema.js';

// UUID v4 pattern
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

// Valid element types for ghost proposal validation
const VALID_ELEMENT_TYPES = new Set([
    'wall', 'slab', 'floor', 'column', 'beam', 'door', 'window',
    'roof', 'stair', 'stairs', 'railing', 'ceiling', 'furniture',
    'curtainwall', 'curtain-wall', 'opening', 'room',
]);

export class AIResponseParser {

    /**
     * Phase 3.3 — Actionable Logs
     *
     * Extracts element IDs (UUIDs) from the QueryResult that the AI referenced.
     * Uses `result.elements` first (typed references), then scans `result.answer`
     * text for UUID patterns as fallback.
     *
     * Returns de-duplicated UUID array.
     */
    static extractElementRefs(result: QueryResult): string[] {
        const seen = new Set<string>();
        const ids: string[] = [];

        // Primary: typed elements array from QueryResult
        if (result.elements && Array.isArray(result.elements)) {
            result.elements.forEach((el: AIElement) => {
                if (el.id && !seen.has(el.id)) {
                    seen.add(el.id);
                    ids.push(el.id);
                }
            });
        }

        // Fallback: scan answer text for UUID patterns
        if (result.answer) {
            const matches = result.answer.match(UUID_PATTERN) ?? [];
            matches.forEach(id => {
                if (!seen.has(id)) {
                    seen.add(id);
                    ids.push(id);
                }
            });
        }

        return ids;
    }

    /**
     * Phase 3.3 — Actionable Logs
     *
     * Returns element IDs that currently exist in the scene / stores.
     * Filters the refs from extractElementRefs by checking known stores.
     */
    static filterExistingElements(ids: string[]): string[] {
        if (ids.length === 0) return [];
        const stores = [
            'wallStore', 'slabStore', 'doorStore', 'windowStore',
            'columnStore', 'furnitureStore', 'roofStore', 'stairStore',
            'curtainWallStore', 'beamStore', 'ceilingStore', 'floorStore',
        ];
        const existingIds = new Set<string>();
        for (const storeName of stores) {
            const store = (window as unknown as Record<string, unknown>)[storeName] as any;
            if (store?.getAll) {
                try {
                    store.getAll().forEach((el: any) => {
                        if (el.id) existingIds.add(el.id);
                    });
                } catch {
                    // store may not be ready — skip silently
                }
            }
        }
        return ids.filter(id => existingIds.has(id));
    }

    /**
     * Phase 3.1 — Ghost Preview
     *
     * Scans `result.answer` for a JSON code block containing a `proposal` object
     * with an `elements` array conforming to ElementSchema.
     *
     * Looks for patterns like:
     * ```json
     * { "proposal": { "elements": [...] } }
     * ```
     * or top-level `{ "elements": [...] }` inside a code fence.
     *
     * Returns validated ElementSchema[] or empty array if none found / invalid.
     */
    static extractGhostProposal(result: QueryResult): ElementSchema[] {
        if (!result.answer) return [];

        // Extract JSON from code fences: ```json ... ``` or ``` ... ```
        const fencePattern = /```(?:json)?\s*([\s\S]*?)```/g;
        let match: RegExpExecArray | null;

        while ((match = fencePattern.exec(result.answer)) !== null) {
            const raw = (match[1] ?? '').trim();
            const schemas = this._tryParseElementSchemas(raw);
            if (schemas.length > 0) return schemas;
        }

        // Also try scanning the entire answer for a JSON object if no fence found
        const braceStart = result.answer.indexOf('{');
        if (braceStart >= 0) {
            const candidate = result.answer.slice(braceStart);
            const schemas = this._tryParseElementSchemas(candidate);
            if (schemas.length > 0) return schemas;
        }

        return [];
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    private static _tryParseElementSchemas(raw: string): ElementSchema[] {
        let parsed: any;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }

        // Try { proposal: { elements: [...] } }
        const els = parsed?.proposal?.elements ?? parsed?.elements;
        if (!Array.isArray(els)) return [];

        const valid: ElementSchema[] = [];
        for (const el of els) {
            const schema = this._validateElementSchema(el);
            if (schema) valid.push(schema);
        }
        return valid;
    }

    private static _validateElementSchema(el: any): ElementSchema | null {
        if (!el || typeof el !== 'object') return null;

        const type = (el.type ?? el.elementType ?? '').toLowerCase();
        const levelId = el.levelId ?? el.level_id;
        const id = el.id ?? crypto.randomUUID();

        if (!type || !VALID_ELEMENT_TYPES.has(type)) {
            console.warn('[AIResponseParser] Rejected element: invalid type', type);
            return null;
        }
        if (!levelId || typeof levelId !== 'string') {
            console.warn('[AIResponseParser] Rejected element: missing levelId', el);
            return null;
        }

        const placement = el.placement ?? {};
        const parameters = el.parameters ?? {};
        const metadata = el.metadata ?? {};

        return { id, type, levelId, placement, parameters, metadata };
    }
}
