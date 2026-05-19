/**
 * @file VGToIntentMigration.ts
 * @migration S89-WIRE (2026-05-01) — moved from `src/migration/VGToIntentMigration.ts`
 *   to `src/core/persistence/migrations/VGToIntentMigration.ts`.
 *   P9-W5 (2026-05-10) — lifted to `packages/core-app-model/src/persistence/migrations/`.
 *
 *   Layer rationale: this file imports exclusively from `packages/core-app-model/src/presentation/`,
 *   making it a peer of the core-persistence layer (L7.5). All presentation/ imports
 *   resolve within the same package via relative paths.
 *
 * VGToIntentMigration — Contract 25a Phase 8.1
 *
 * One-time migration that reads all VGTemplate records from VGGovernanceStore
 * and converts them into VisibilityIntent records in VisibilityIntentStore,
 * then assigns each view's current VGTemplate to a new ViewIntentInstance.
 *
 * Also converts VGInstanceOverrideStore per-element overrides into
 * GraphicOverride entries in the OverrideLayer of the relevant ViewIntentInstance.
 *
 * Contract compliance:
 *   Contract 25  §12 Phase 8.1 — VG → Intent Migration
 *   Contract 25a §8.1          — Migration spec
 *   §01 §2.1                   — Store mutations via the migration API only
 *                                (this runs at project-load time, before commands)
 *
 * Running conditions:
 *   Called by ProjectLoader after stores are hydrated, before the first render.
 *   Skipped if `visibilityIntentStore.getAll()` already contains user intents —
 *   meaning the migration was already completed in a previous session.
 *
 * Post-condition:
 *   VGGovernanceStore data is preserved (read-only legacy). The Intent system
 *   takes over as the style authority from this point forward.
 */

import { vgGovernanceStore } from '../../presentation/VGGovernanceStore';
import { vgInstanceOverrideStore } from '../../presentation/VGInstanceOverrideStore';
import { visibilityIntentStore } from '../../presentation/VisibilityIntentStore';
import { viewIntentInstanceStore } from '../../presentation/ViewIntentInstanceStore';
import type {
    ElementGraphicsRules,
    ElementStateAppearance,
    FillAppearance,
    GraphicOverride,
    LineAppearance,
    OverrideLayer,
    VisibilityIntent,
} from '../../presentation/VisibilityIntentTypes';
import type { VGCategoryStyle, VGTemplate } from '../../presentation/VGGovernanceStore';
import { EMPTY_OVERRIDE_LAYER } from '../../presentation/VisibilityIntentTypes';
import { resolveIntentStyle } from '../../presentation/IntentRuleResolver';

// ── VG Category → BIM element type mapping ─────────────────────────────────

const VG_CATEGORY_TO_ELEMENT_TYPE: Record<string, string> = {
    wall:          'wall',
    slab:          'slab',
    column:        'column',
    beam:          'beam',
    door:          'door',
    window:        'window',
    'curtain-wall':'curtain-wall',
    'curtain-panel':'curtain-panel',
    stair:         'stair',
    railing:       'railing',
    handrail:      'handrail',
    ceiling:       'ceiling',
    floor:         'slab',
    roof:          'roof',
    furniture:     'furniture',
    plumbing:      'plumbing',
    structural:    'structural',
};

// ── VGCategoryStyle → ElementGraphicsRules conversion ───────────────────────

function makeLineAppearance(colour: string, weight: number, style: LineAppearance['style'] = 'solid', opacity = 1): LineAppearance {
    return { style, weight: Math.max(0.05, weight), colour, opacity };
}

function makeFillAppearance(colour: string, opacity: number, fillStyle: FillAppearance['style'] = 'solid'): FillAppearance {
    return { style: fillStyle, colour, opacity: Math.min(1, Math.max(0, opacity)) };
}

function makeStateAppearance(
    lineColour: string,
    lineWeight: number,
    lineStyle: LineAppearance['style'],
    fillColour: string,
    fillOpacity: number,
    fillStyle: FillAppearance['style'],
    visible: boolean,
    ghostStyle?: ElementStateAppearance['ghostStyle'],
    ghostOpacity?: number,
): ElementStateAppearance {
    return {
        line: makeLineAppearance(lineColour, lineWeight, lineStyle),
        fill: makeFillAppearance(fillColour, fillOpacity, fillStyle),
        visible,
        ghostStyle: ghostStyle ?? 'none',
        ghostOpacity: ghostOpacity ?? 0,
    };
}

function vgCategoryStyleToElementGraphicsRules(
    elementType: string,
    style: VGCategoryStyle,
): ElementGraphicsRules {
    const edgeColour = style.edgeColor ?? '#000000';
    const fillColour = style.fillColor ?? '#cccccc';
    const beyondColour = style.beyondEdgeColor ?? '#9ca3af';

    const cutWeight = style.cutLineWeight ?? Math.max(style.lineWeight, style.lineWeight + 0.18);
    const projWeight = style.projectionLineWeight ?? style.lineWeight;
    const beyondWeight = style.beyondLineWeight ?? Math.max(0.05, style.lineWeight - 0.18);
    const beyondOpacity = style.transparency > 0 ? 1 - style.transparency : 0.55;
    const beyondVisible = style.beyondVisible ?? true;

    const hasPocheFill = ['wall', 'slab', 'column', 'structural', 'beam'].includes(elementType);
    const cutFillStyle: FillAppearance['style'] = hasPocheFill ? 'poche' : (style.fillPattern ? 'hatch' : 'solid');

    const cutState = makeStateAppearance(
        edgeColour, cutWeight, 'solid',
        fillColour, style.transparency > 0 ? 1 - style.transparency : 1,
        cutFillStyle,
        style.visible,
    );

    const beyondState = makeStateAppearance(
        beyondColour, beyondWeight, 'solid',
        fillColour, 0,
        'none',
        beyondVisible,
        'fade',
        beyondOpacity,
    );

    const hiddenState = makeStateAppearance(
        edgeColour, Math.max(0.05, beyondWeight * 0.7), 'dashed',
        fillColour, 0, 'none',
        false,
        'fade',
        0.25,
    );

    const projectionState = makeStateAppearance(
        edgeColour, projWeight, 'solid',
        fillColour, 0, 'none',
        style.visible,
    );

    return {
        elementType,
        cut: cutState,
        beyond: beyondState,
        hidden: hiddenState,
        projection: projectionState,
    };
}

// ── VGTemplate → VisibilityIntent ─────────────────────────────────────────

function vgTemplateToVisibilityIntent(template: VGTemplate): VisibilityIntent {
    const elementRules: Record<string, ElementGraphicsRules> = {};

    for (const [vgCategory, style] of Object.entries(template.categories ?? {})) {
        const elementType = VG_CATEGORY_TO_ELEMENT_TYPE[vgCategory] ?? vgCategory;
        elementRules[elementType] = vgCategoryStyleToElementGraphicsRules(elementType, style);
    }

    const now = new Date().toISOString();
    return {
        id: `migrated-${template.id}`,
        name: `${template.name} (Migrated)`,
        description: template.description ?? `Migrated from VG template: ${template.name}`,
        version: 1,
        isSystem: false,
        createdAt: now,
        updatedAt: now,
        elementRules,
        viewTypeModifiers: [],
    };
}

// ── VGInstanceOverrideStore → GraphicOverride[] ────────────────────────────

function vgInstanceOverridesToGraphicOverrides(
    elementId: string,
    style: Partial<VGCategoryStyle>,
): GraphicOverride[] {
    const overrides: GraphicOverride[] = [];
    const lineColour = style.edgeColor;
    const lineWeight = style.lineWeight;
    const fillColour = style.fillColor;

    for (const state of ['cut', 'beyond', 'projection'] as const) {
        const patch: GraphicOverride['patch'] = {};
        let hasPatch = false;

        if (lineColour !== undefined || lineWeight !== undefined) {
            patch.line = {
                style: 'solid',
                weight: lineWeight ?? 0.25,
                colour: lineColour ?? '#000000',
                opacity: 1,
            };
            hasPatch = true;
        }

        if (fillColour !== undefined) {
            patch.fill = { style: 'solid', colour: fillColour, opacity: 1 };
            hasPatch = true;
        }

        if (style.visible === false) {
            patch.visible = false;
            hasPatch = true;
        }

        if (hasPatch) {
            overrides.push({
                targetKind: 'element',
                targetId: elementId,
                state,
                patch,
            });
        }
    }

    return overrides;
}

// ── Migration entry point ─────────────────────────────────────────────────

/**
 * Returns true if the migration has already been completed (user intents exist
 * that were seeded from VG templates).
 */
export function isMigrationComplete(): boolean {
    return visibilityIntentStore.getAll().some(i => !i.isSystem && i.id.startsWith('migrated-'));
}

/**
 * Runs the VG → Intent migration.
 *
 * Safe to call multiple times — skipped if `isMigrationComplete()` returns true.
 *
 * @returns number of intents created
 */
export function runVGToIntentMigration(): { intentCount: number; viewCount: number; overrideCount: number } {
    if (isMigrationComplete()) {
        console.log('[VGToIntentMigration] Already complete — skipping.');
        return { intentCount: 0, viewCount: 0, overrideCount: 0 };
    }

    console.log('[VGToIntentMigration] Starting VG → Intent migration…');

    let intentCount = 0;
    let viewCount = 0;
    let overrideCount = 0;

    // ── Step 1: Convert VGTemplates → VisibilityIntents ───────────────────
    const templateToIntentId = new Map<string, string>();
    const userTemplates = vgGovernanceStore.getAllTemplates().filter(t => !t.isBuiltIn);

    for (const template of userTemplates) {
        const intent = vgTemplateToVisibilityIntent(template);
        const created = visibilityIntentStore.create(intent);
        if (created) {
            templateToIntentId.set(template.id, intent.id);
            intentCount++;
            console.log(`[VGToIntentMigration] Created intent '${intent.name}' from template '${template.name}'`);
        }
    }

    // ── Step 2: Assign view-level intent instances ─────────────────────────
    const models = vgGovernanceStore.getAllModels();
    const views = vgGovernanceStore.getAllViews();

    for (const view of views) {
        const model = models.find(m => m.modelId === view.modelId);
        const templateId = model?.templateId ?? null;
        const intentId = templateId ? templateToIntentId.get(templateId) : null;

        if (!intentId) continue;

        const instance = viewIntentInstanceStore.assign(view.viewId, intentId);
        if (!instance) continue;

        viewCount++;

        // ── Step 3: Convert VGInstanceOverrideStore overrides → GraphicOverrides ──
        const instanceOverrides = vgInstanceOverrideStore.getAllForView(view.viewId);
        if (!instanceOverrides || instanceOverrides.length === 0) continue;

        const graphicOverrides: GraphicOverride[] = [];

        for (const { elementId, style } of instanceOverrides) {
            const converted = vgInstanceOverridesToGraphicOverrides(elementId, style);
            graphicOverrides.push(...converted);
            overrideCount += converted.length;
        }

        if (graphicOverrides.length > 0) {
            const layer: OverrideLayer = {
                ...JSON.parse(JSON.stringify(EMPTY_OVERRIDE_LAYER)),
                graphicOverrides,
            };
            viewIntentInstanceStore.updateOverrides(view.viewId, layer);
            console.log(
                `[VGToIntentMigration] View '${view.viewId}': migrated ${graphicOverrides.length} graphic overrides`
            );
        }
    }

    console.log(
        `[VGToIntentMigration] Complete — ${intentCount} intents, ${viewCount} views, ${overrideCount} overrides migrated.`
    );

    return { intentCount, viewCount, overrideCount };
}

/**
 * Phase 8.2 — Style cache pre-warming.
 *
 * After project load or intent assignment, pre-resolves the style for every
 * known element type × state × view type combination so the first render
 * frame is served from cache.
 *
 * Called from ProjectLoader after runVGToIntentMigration() and store hydration.
 *
 * Target: < 0.5 ms total for all cold resolves per Contract 25a §8.2.
 */
export function prewarmIntentStyleCache(): void {
    const { IntentStylePrewarmer } = (globalThis as any).__pryzm_intent_prewarmer__ ?? {};
    if (typeof IntentStylePrewarmer?.prewarm === 'function') {
        IntentStylePrewarmer.prewarm();
        return;
    }

    const intents = visibilityIntentStore.getAll();
    if (intents.length === 0) return;

    const states: Array<'cut' | 'beyond' | 'hidden' | 'projection'> = ['cut', 'beyond', 'hidden', 'projection'];
    const viewTypes = ['plan', 'section', 'elevation', 'detail', 'rcp', '3d'];

    const t0 = performance.now();
    let resolves = 0;

    for (const intent of intents) {
        const elementTypes = Object.keys(intent.elementRules);
        if (elementTypes.length === 0) continue;

        const fakeInstance = {
            id: '_prewarm',
            viewId: '_prewarm',
            intentId: intent.id,
            localOverrides: JSON.parse(JSON.stringify(EMPTY_OVERRIDE_LAYER)),
            createdAt: '',
            updatedAt: '',
        };

        for (const et of elementTypes) {
            for (const state of states) {
                for (const vt of viewTypes) {
                    resolveIntentStyle(fakeInstance, intent, et, state, vt, { elementType: et, category: et });
                    resolves++;
                }
            }
        }
    }

    const elapsed = (performance.now() - t0).toFixed(2);
    console.log(`[IntentStylePrewarmer] Pre-warmed ${resolves} style slots in ${elapsed}ms`);
}
