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
        // The paper box is applied by `resolve()`, not by this preset — hence
        // `_paper`, matching the sibling presets below. (It used to destructure
        // w/h/marginMm and `void` them on a line placed AFTER the return, i.e.
        // unreachable, which suppressed nothing.)
        build(viewportIds, _paper) {
            const id = viewportIds[0];
            if (!id) return [];
            return [{
                id:       `lr-${crypto.randomUUID()}`,
                targetId: id,
                priority: 1,
                rule:     { type: 'anchor', edge: 'center', offset: 0 },
            }];
        },
    },
    {
        key:         'plan-two-sections',
        name:        'Plan + Two Sections',
        description: 'Main plan top-centre, Section A bottom-left, Section B bottom-right.',
        // §PRESETS-MUST-PLACE (L-10686) — THIS PRESET STACKED BOTH SECTIONS ON
        // THE SAME SPOT. It anchored viewport 1 AND viewport 2 to
        // `edge: 'bottom'`, and `resolve()` gives every `bottom` anchor the same
        // horizontally-centred x. Two sections, one position, one of them
        // invisible underneath the other — against a description that says
        // "bottom-LEFT" and "bottom-RIGHT". Now uses the corner anchors added
        // to `LayoutRuleAnchor` for exactly this.
        build(viewportIds, _paper) {
            const rules: LayoutRule[] = [];
            if (viewportIds[0]) rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: viewportIds[0], priority: 1, rule: { type: 'anchor', edge: 'top',          offset: 10 } });
            if (viewportIds[1]) rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: viewportIds[1], priority: 2, rule: { type: 'anchor', edge: 'bottom-left',  offset: 10 } });
            if (viewportIds[2]) rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: viewportIds[2], priority: 3, rule: { type: 'anchor', edge: 'bottom-right', offset: 10 } });
            return rules;
        },
    },
    {
        key:         'plan-detail-column',
        name:        'Plan + Detail Column',
        description: 'Main plan left two-thirds, detail views stacked in right third.',
        // §PRESETS-MUST-PLACE (L-10686) — THE SECOND STACK RULE TARGETED
        // `details[0]` INSTEAD OF `details[1]`. So `details[1..n]` received no
        // rule at all and never moved, while `details[0]` got two rules that
        // fought each other. A six-detail sheet arranged exactly one detail.
        //
        // Now: the plan anchors LEFT, and EVERY detail is anchored top-right
        // and given a vertical stack rule, so the column reads downward from
        // the top-right corner — which is what "detail column" means and what
        // the description has always claimed.
        build(viewportIds, paper) {
            const rules: LayoutRule[] = [];
            if (viewportIds[0]) rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: viewportIds[0], priority: 1, rule: { type: 'anchor', edge: 'left', offset: paper.marginMm } });
            const details = viewportIds.slice(1);
            for (const [i, id] of details.entries()) {
                // Priority 2 for every anchor, so all of them resolve before
                // any stack rule reads the column's origin.
                rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: id, priority: 2,          rule: { type: 'anchor', edge: 'top-right', offset: paper.marginMm } });
                rules.push({ id: `lr-${crypto.randomUUID()}`, targetId: id, priority: 100 + i,    rule: { type: 'stack',  direction: 'vertical', gap: 10 } });
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
                    // Named once so the corner cases below cannot drift from
                    // the edge cases they are built out of.
                    const leftX   = paper.marginMm + rule.offset;
                    const rightX  = paper.w - paper.marginMm - rule.offset - size.w;
                    const topY    = paper.h - paper.marginMm - rule.offset - size.h;
                    const bottomY = paper.marginMm + rule.offset;
                    const midX    = paper.w / 2 - size.w / 2;
                    const midY    = paper.h / 2 - size.h / 2;

                    let x = paper.marginMm;
                    let y = paper.marginMm;
                    switch (rule.edge) {
                        case 'left':         x = leftX;  y = midY;    break;
                        case 'right':        x = rightX; y = midY;    break;
                        case 'top':          x = midX;   y = topY;    break;
                        case 'bottom':       x = midX;   y = bottomY; break;
                        case 'center':       x = midX;   y = midY;    break;
                        // §PRESETS-MUST-PLACE (L-10686) — the four corners.
                        case 'bottom-left':  x = leftX;  y = bottomY; break;
                        case 'bottom-right': x = rightX; y = bottomY; break;
                        case 'top-left':     x = leftX;  y = topY;    break;
                        case 'top-right':    x = rightX; y = topY;    break;
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

                    // §PRESETS-MUST-PLACE (L-10686) — A STACK STARTS WHERE IT
                    // WAS ANCHORED.
                    //
                    // This used to pin every stack to the paper's bottom-left
                    // margin corner, which made `stack` unusable in combination
                    // with an anchor: `plan-detail-column` anchors the plan to
                    // the left and wants its detail column stacked down the
                    // RIGHT-hand side, and the old arithmetic dropped that
                    // column straight on top of the plan.
                    //
                    // The origin is now whatever the FIRST stack target already
                    // resolved to under a higher-priority rule (anchors run
                    // first because presets give them a lower `priority`),
                    // falling back to the margin corner when nothing anchored
                    // it — which reproduces the previous behaviour exactly for
                    // any stack that stands alone.
                    const originId  = allStackTargets[0];
                    const anchored  = originId !== undefined ? results.get(originId) : undefined;
                    const originX   = anchored?.x ?? paper.marginMm;
                    const originY   = anchored?.y ?? paper.marginMm;

                    // Sizes ACCUMULATE. `idx * (size.h + gap)` assumed every
                    // block in the stack was the same size as this one, which
                    // is false the moment a 1:50 detail sits under a 1:5 one:
                    // the column then overlaps or leaves a gash. Walk the
                    // preceding blocks and add their real extents.
                    const sizeOf = (id: string) =>
                        blockSizes.get(id) ?? { w: usableW * 0.4, h: usableH * 0.4 };

                    if (rule.direction === 'horizontal') {
                        // Reads LEFT→RIGHT: item i starts past the right edge
                        // of everything before it.
                        let dx = 0;
                        for (let i = 0; i < idx; i++) dx += sizeOf(allStackTargets[i]!).w + rule.gap;
                        results.set(targetId, { id: targetId, x: originX + dx, y: originY, w: size.w, h: size.h });
                    } else {
                        // Reads DOWNWARD from the origin: the first item is the
                        // TOP one, which is how a detail column is read on
                        // paper. `position` is the BOTTOM-left corner
                        // (§SHEET-PDF-PLACES-THE-VIEWPORT / L-1874), so block i
                        // sits its own height plus one gap below block i−1's
                        // bottom. Clamped at the bottom margin so a long column
                        // cannot walk off the sheet.
                        let dy = 0;
                        for (let i = 1; i <= idx; i++) dy += sizeOf(allStackTargets[i]!).h + rule.gap;
                        const y = Math.max(paper.marginMm, originY - dy);
                        results.set(targetId, { id: targetId, x: originX, y, w: size.w, h: size.h });
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
