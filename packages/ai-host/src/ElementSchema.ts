/**
 * ElementSchema — AI Ghost Preview type contract.
 *
 * Extracted from src/engine/subsystems/core/preview/PreviewManager.ts
 * during Sprint AJ extraction (ai/ → @pryzm/ai-host).
 *
 * PreviewManager imports AIElement from @pryzm/ai-host/AITypes; keeping
 * ElementSchema here avoids a circular dependency between the host package
 * and the editor's preview layer.
 *
 * Source: Phase 3 §3.1 — AI Ghost Preview Layer.
 */

export interface ElementSchema {
    id: string;
    type: string;
    levelId: string;
    placement?: {
        x?: number;
        y?: number;
        z?: number;
        width?: number;
        height?: number;
        depth?: number;
        length?: number;
        thickness?: number;
        startX?: number;
        startZ?: number;
        endX?: number;
        endZ?: number;
    };
    parameters?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
