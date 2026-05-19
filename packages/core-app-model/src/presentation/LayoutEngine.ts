/**
 * LayoutEngine — Phase SC-4 (Next-Gen Sheet Composition Engine)
 * src/core/presentation/LayoutEngine.ts
 *
 * Resolves LayoutRule[] into concrete (x, y) positions for ViewBlocks and DataPanels.
 * Built-in layout presets provide one-click sheet arrangement templates.
 *
 * Contract compliance:
 *   §01 §2   — Read-only; no store writes; positions are returned, not applied
 *   §02 §1.2 — Paper dimensions passed in as arguments; no hard-coded sizes
 *   §05      — No DOM; no Three.js; pure computation
 *   §06      — No platform-layer imports
 *   §07      — No server routes; entirely client-side
 *
 * Usage:
 *   import { layoutEngine } from './LayoutEngine';
 *   const positions = layoutEngine.resolve(sheet.layoutRules, viewportIds, { w, h, marginMm });
 *   const rules     = layoutEngine.buildPreset('plan-two-sections', viewportIds, { w, h, marginMm });
 */

import type { LayoutRule, LayoutPreset, LayoutPresetKey, ResolvedPosition } from '@pryzm/core-app-model';

// ── Paper helper ───────────────────────────────────────────────────────────────

export interface PaperParams {
    w:        number;   // Paper usable width  in mm (after title block removed)
    h:        number;   // Paper usable height in mm
    marginMm: number;   // Margin from paper edge in mm
}

// ── Built-in preset definitions ────────────────────────────────────────────────

const PRESETS: LayoutPreset[] = [
    {
        key:         'single-centred',
        name:        'Single View Centred',
        description: 'Main view fills the available paper area minus margins.',
        build(viewportIds, paper) {
            const id = viewportIds[0];
            if (!id) return [];
            const { w, h, marginMm } = paper;
            return [{
                id:       `lr-${crypto.randomUUID()}`,
                targetId: id,
                priority: 1,
                rule:     { type: 'anchor', edge: 'center', offset: 0 },
            }];
            void w; void h; void marginMm; // used indirectly via resolve()
        },
    },
    {
        key:         'plan-two-sections',
        name:        'Plan + Two Sections',
        description: 'Main plan top-centre, Section A bottom-left, Section B bottom-right.',
        build(viewportIds, _paper) {
            const rules: LayoutRule[] = [];
            if (viewportIds[0]) rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: viewportIds[0], priority: 1, rule: { type: 'anchor', edge: 'top', offset: 10 } });
            if (viewportIds[1]) rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: viewportIds[1], priority: 2, rule: { type: 'anchor', edge: 'bottom', offset: 10 } });
            if (viewportIds[2]) rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: viewportIds[2], priority: 3, rule: { type: 'anchor', edge: 'bottom', offset: 10 } });
            return rules;
        },
    },
    {
        key:         'plan-detail-column',
        name:        'Plan + Detail Column',
        description: 'Main plan left two-thirds, detail views stacked in right third.',
        build(viewportIds, paper) {
            const rules: LayoutRule[] = [];
            if (viewportIds[0]) rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: viewportIds[0], priority: 1, rule: { type: 'anchor', edge: 'left', offset: paper.marginMm } });
            const details = viewportIds.slice(1);
            if (details.length > 0) {
                rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: details[0], priority: 2, rule: { type: 'anchor', edge: 'right', offset: paper.marginMm } });
                if (details.length > 1) {
                    rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: details[0], priority: 3, rule: { type: 'stack', direction: 'vertical', gap: 10 } });
                }
            }
            return rules;
        },
    },
    {
        key:         'four-up',
        name:        'Four Up',
        description: 'Four equally-sized viewports in a 2×2 grid.',
        build(viewportIds, _paper) {
            const rules: LayoutRule[] = [];
            viewportIds.slice(0, 4).forEach((id, i) => {
                rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: id, priority: i + 1, rule: { type: 'grid', columns: 2, rows: 2, cellPadding: 10 } });
            });
            return rules;
        },
    },
    {
        key:         'schedule-sheet',
        name:        'Schedule Sheet',
        description: 'One or two schedules filling the usable paper area.',
        build(viewportIds, paper) {
            const rules: LayoutRule[] = [];
            viewportIds.slice(0, 2).forEach((id, i) => {
                rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: id, priority: i + 1, rule: { type: 'anchor', edge: i === 0 ? 'top' : 'bottom', offset: paper.marginMm } });
            });
            return rules;
        },
    },
    {
        key:         'detail-sheet',
        name:        'Detail Sheet',
        description: '6–9 detail viewports arranged in a 3×3 grid.',
        build(viewportIds, _paper) {
            const rules: LayoutRule[] = [];
            viewportIds.slice(0, 9).forEach((id, i) => {
                rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: id, priority: i + 1, rule: { type: 'grid', columns: 3, rows: 3, cellPadding: 8 } });
            });
            return rules;
        },
    },
];

// ── LayoutEngine ───────────────────────────────────────────────────────────────

class LayoutEngineImpl {

    /**
     * Returns all built-in layout presets (metadata only — no rules built yet).
     */
    getPresets(): Array<Pick<LayoutPreset, 'key' | 'name' | 'description'>> {
        return PRESETS.map(({ key, name, description }) => ({ key, name, description }));
    }

    /**
     * Builds the LayoutRule[] for a named preset given the current viewport IDs.
     * Call this before dispatching ApplySheetLayoutPresetCommand.
     */
    buildPreset(
        key:         LayoutPresetKey,
        viewportIds: string[],
        paper:       PaperParams,
    ): LayoutRule[] {
        const preset = PRESETS.find(p => p.key === key);
        if (!preset) {
            console.warn(`[LayoutEngine] Unknown preset key: ${key}`);
            return [];
        }
        return preset.build(viewportIds, paper);
    }

    /**
     * Resolves LayoutRule[] into ResolvedPosition[] for all targeted blocks.
     * Rules are applied in priority order (ascending). Blocks not covered by any rule
     * are not returned — callers should fall back to the stored position for those.
     *
     * @param rules     - Array of rules to evaluate (sorted internally by priority).
     * @param paper     - Paper dimensions and margin.
     * @param blockSizes - Optional map from block id → { w, h } in mm. Used by grid/stack.
     */
    resolve(
        rules:      LayoutRule[],
        paper:      PaperParams,
        blockSizes: Map<string, { w: number; h: number }> = new Map(),
    ): ResolvedPosition[] {
        const sorted  = [...rules].sort((a, b) => a.priority - b.priority);
        const results = new Map<string, ResolvedPosition>();
        const usableW = paper.w - paper.marginMm * 2;
        const usableH = paper.h - paper.marginMm * 2;

        for (const lr of sorted) {
            const { targetId, rule } = lr;
            const size = blockSizes.get(targetId) ?? { w: usableW * 0.4, h: usableH * 0.4 };

            switch (rule.type) {
                case 'anchor': {
                    let x = paper.marginMm;
                    let y = paper.marginMm;
                    switch (rule.edge) {
                        case 'left':   x = paper.marginMm + rule.offset; y = paper.h / 2 - size.h / 2; break;
                        case 'right':  x = paper.w - paper.marginMm - rule.offset - size.w; y = paper.h / 2 - size.h / 2; break;
                        case 'top':    x = paper.w / 2 - size.w / 2; y = paper.h - paper.marginMm - rule.offset - size.h; break;
                        case 'bottom': x = paper.w / 2 - size.w / 2; y = paper.marginMm + rule.offset; break;
                        case 'center': x = paper.w / 2 - size.w / 2; y = paper.h / 2 - size.h / 2; break;
                    }
                    results.set(targetId, { id: targetId, x, y, w: size.w, h: size.h });
                    break;
                }
                case 'align': {
                    const ref = results.get(rule.with);
                    if (!ref) break;
                    const existing = results.get(targetId) ?? { id: targetId, x: paper.marginMm, y: paper.marginMm };
                    if (rule.axis === 'x') existing.x = ref.x;
                    else existing.y = ref.y;
                    results.set(targetId, existing);
                    break;
                }
                case 'grid': {
                    // Assign grid cell positions to all blocks that share this rule.
                    const allGridTargets = sorted
                        .filter(r => r.rule.type === 'grid')
                        .map(r => r.targetId);
                    const idx = allGridTargets.indexOf(targetId);
                    if (idx === -1) break;
                    const cellW = (usableW - rule.cellPadding * (rule.columns - 1)) / rule.columns;
                    const cellH = (usableH - rule.cellPadding * (rule.rows    - 1)) / rule.rows;
                    const col   = idx % rule.columns;
                    const row   = Math.floor(idx / rule.columns);
                    const x     = paper.marginMm + col * (cellW + rule.cellPadding);
                    const y     = paper.marginMm + row * (cellH + rule.cellPadding);
                    results.set(targetId, { id: targetId, x, y, w: cellW, h: cellH });
                    break;
                }
                case 'stack': {
                    const allStackTargets = sorted
                        .filter(r => r.rule.type === 'stack')
                        .map(r => r.targetId);
                    const idx = allStackTargets.indexOf(targetId);
                    if (idx === -1) break;
                    if (rule.direction === 'horizontal') {
                        const x = paper.marginMm + idx * (size.w + rule.gap);
                        results.set(targetId, { id: targetId, x, y: paper.marginMm, w: size.w, h: size.h });
                    } else {
                        const y = paper.marginMm + idx * (size.h + rule.gap);
                        results.set(targetId, { id: targetId, x: paper.marginMm, y, w: size.w, h: size.h });
                    }
                    break;
                }
                case 'distribute': {
                    // Simple evenly-spaced distribution
                    const allDistTargets = sorted
                        .filter(r => r.rule.type === 'distribute')
                        .map(r => r.targetId);
                    const n   = allDistTargets.length;
                    const idx = allDistTargets.indexOf(targetId);
                    if (idx === -1 || n < 2) break;
                    if (rule.axis === 'x') {
                        const step = (usableW - size.w) / (n - 1);
                        results.set(targetId, { id: targetId, x: paper.marginMm + idx * step, y: paper.marginMm, w: size.w, h: size.h });
                    } else {
                        const step = (usableH - size.h) / (n - 1);
                        results.set(targetId, { id: targetId, x: paper.marginMm, y: paper.marginMm + idx * step, w: size.w, h: size.h });
                    }
                    break;
                }
            }
        }

        return [...results.values()];
    }
}

// ── Singleton export ───────────────────────────────────────────────────────────

export const layoutEngine = new LayoutEngineImpl();
export type { LayoutEngineImpl };
