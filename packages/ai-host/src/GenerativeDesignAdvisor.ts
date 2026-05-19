/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    AI Services (World Model Layer 4)
 * Phase:             Phase I-4
 * Files Modified:    src/ai/GenerativeDesignAdvisor.ts
 * Classification:    A
 *
 * Client-side wrapper for the /api/ai/generative/advise endpoint.
 * Never calls Anthropic directly — all AI calls route through the server.
 */

import type { GenerativeDesignBrief, AdvisorResponse, AdvisorSuggestion } from './generative/GenerativeTypes.js';

export class GenerativeDesignAdvisor {
    async advise(
        brief: GenerativeDesignBrief,
        violations: string[],
    ): Promise<AdvisorResponse> {
        try {
            const resp = await fetch('/api/ai/generative/advise', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brief, violations }),
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({})) as any;
                throw new Error(err?.error ?? `HTTP ${resp.status}`);
            }

            const data = await resp.json() as any;
            return this._parseResponse(data, brief, violations);
        } catch (e: any) {
            console.error('[GenerativeDesignAdvisor] advise failed:', e.message);
            return {
                canGenerate: false,
                suggestions: [{
                    id: 'fallback-resize',
                    type: 'resize_bbox',
                    title: 'Try a larger bounding box',
                    description: `Increase the bounding box to fit all ${brief.rooms.reduce((s, r) => s + r.count, 0)} rooms with circulation space.`,
                    briefPatch: {
                        boundingBox: {
                            width_m: Math.ceil(brief.boundingBox.width_m * 1.25),
                            depth_m: Math.ceil(brief.boundingBox.depth_m * 1.25),
                        },
                    },
                }],
                rawText: e.message,
            };
        }
    }

    private _parseResponse(data: any, brief: GenerativeDesignBrief, violations: string[]): AdvisorResponse {
        const rawText: string = data?.rawText ?? data?.content?.[0]?.text ?? '';
        const suggestions: AdvisorSuggestion[] = [];

        const lines = rawText.split('\n').filter((l: string) => l.trim());

        lines.forEach((line: string, i: number) => {
            const lower = line.toLowerCase();

            if (lower.includes('bounding box') || lower.includes('increase') || lower.includes('enlarge')) {
                const dims = line.match(/(\d+)\s*[m×x]\s*(\d+)/);
                suggestions.push({
                    id: `suggestion-${i}`,
                    type: 'resize_bbox',
                    title: 'Resize bounding box',
                    description: line.trim(),
                    ...(dims ? { briefPatch: { boundingBox: { width_m: parseInt(dims[1]!, 10), depth_m: parseInt(dims[2]!, 10) } } } : {}),
                });
            } else if (lower.includes('adjacen') || lower.includes('hub') || lower.includes('spoke')) {
                suggestions.push({
                    id: `suggestion-${i}`,
                    type: 'reorder_adjacency',
                    title: 'Revise adjacency requirements',
                    description: line.trim(),
                });
            } else if (lower.includes('reduc') || lower.includes('remov') || lower.includes('fewer')) {
                suggestions.push({
                    id: `suggestion-${i}`,
                    type: 'reduce_programme',
                    title: 'Reduce programme',
                    description: line.trim(),
                });
            } else if (line.trim().length > 20) {
                suggestions.push({
                    id: `suggestion-${i}`,
                    type: 'general',
                    title: 'Suggestion',
                    description: line.trim(),
                });
            }
        });

        if (suggestions.length === 0) {
            suggestions.push({
                id: 'fallback',
                type: 'resize_bbox',
                title: 'Increase bounding box by 25%',
                description: `The current ${brief.boundingBox.width_m}m × ${brief.boundingBox.depth_m}m bounding box may be too small. Try ${Math.ceil(brief.boundingBox.width_m * 1.25)}m × ${Math.ceil(brief.boundingBox.depth_m * 1.25)}m.`,
                briefPatch: {
                    boundingBox: {
                        width_m: Math.ceil(brief.boundingBox.width_m * 1.25),
                        depth_m: Math.ceil(brief.boundingBox.depth_m * 1.25),
                    },
                },
            });
        }

        return {
            canGenerate: violations.length === 0,
            suggestions: suggestions.slice(0, 5),
            rawText,
        };
    }
}

export const generativeAdvisor = new GenerativeDesignAdvisor();
