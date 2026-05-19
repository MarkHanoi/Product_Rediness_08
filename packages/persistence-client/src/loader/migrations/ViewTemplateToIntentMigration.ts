/**
 * @file ViewTemplateToIntentMigration.ts
 * @migration S89-WIRE (2026-05-01) — moved from `src/migration/ViewTemplateToIntentMigration.ts`
 *   to `src/core/persistence/migrations/ViewTemplateToIntentMigration.ts`.
 *
 *   Layer rationale: same as VGToIntentMigration — depends on live Zustand stores
 *   in `src/core/presentation/` and `src/core/views/`, so it cannot live in a pure
 *   `packages/` layer.  Placed alongside its sibling migration and `MigrationEngine.ts`
 *   in `src/core/persistence/migrations/`.
 *
 *   The `src/migration/` directory is deleted by this migration.  ProjectLoader.ts
 *   dynamic import (line 1056) has been updated from
 *   `'../../migration/ViewTemplateToIntentMigration'` →
 *   `'./migrations/ViewTemplateToIntentMigration'`.
 *   All `'../core/'` prefixes corrected to `'../../'` for the new file depth.
 *
 * ViewTemplateToIntentMigration — Master Implementation Plan Wave 1 / Stage P0
 * ───────────────────────────────────────────────────────────────────────────
 *
 * One-time, idempotent migration that folds every legacy `ViewTemplate` record
 * (Phase VII / `viewTemplateStore`) into a `VisibilityIntent.viewSeed` payload
 * (Wave 1 schema bump v3 → v4 — see IntentSchemaMigrations.ts).
 *
 * After this runs, the Intent system owns BOTH appearance (elementRules /
 * modifiers) AND view-creation defaults (nameTemplate, scale, locked fields).
 * The legacy `viewTemplateStore` is `@deprecated readable` — see header of
 * `src/core/views/ViewTemplateStore.ts`.
 *
 * Pipeline (per template):
 *   1. Look for an existing migrated intent (id prefix `migrated-vt-<templateId>`).
 *      If present → skip (idempotent).
 *   2. Otherwise create a fresh, isSystem=false intent that:
 *        • mirrors the template's name and discipline,
 *        • starts with the default ElementGraphicsRules (the appearance side
 *          of view templates was always implicit — no rules were ever stored
 *          on them at the rule level),
 *        • carries a fully-populated `viewSeed` block built from the
 *          template's output / temporal / lockedFields data.
 *   3. Re-bind every `ViewDefinition` whose `viewTemplateId === template.id`
 *      to the new intent via `viewIntentInstanceStore.assign(viewId, intentId)`.
 *
 * Running conditions:
 *   • Called by ProjectLoader after stores are hydrated and after
 *     `runVGToIntentMigration()`, before the first render.
 *   • Skipped wholesale once any `migrated-vt-*` intent already exists.
 *
 * Post-condition:
 *   • `viewTemplateStore` data is preserved (read-only legacy).
 *   • Every previously template-bound view now has a `ViewIntentInstance`
 *     pointing at the absorbed intent.
 *   • `intent.viewSeed` is the canonical source for "Create View from Intent"
 *     and Wave-3 view-header recipe affordances.
 *
 * Contract compliance:
 *   Contract 25  §12 Phase 8.x — VG/View Template → Intent Migration
 *   Contract 25a §8.1          — Migration spec (extended for view seed)
 *   §01 §2.1                   — Store mutations are migration-API-only at load
 *
 * Implementation source: docs/Analysis/MASTER-IMPLEMENTATION-PLAN.md §4 (Wave 1 / P0).
 */

import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { viewTemplateStore } from '@pryzm/core-app-model';
import type {
    VisibilityIntent,
    ViewSeed,
    ViewSeedDiscipline,
    ViewSeedPurpose,
    ViewSeedLockableField,
} from '@pryzm/core-app-model';
import { cloneDefaultElementGraphicsRules } from '@pryzm/core-app-model';
import { CURRENT_INTENT_SCHEMA_VERSION } from '@pryzm/core-app-model';
import type { ViewTemplate } from '@pryzm/core-app-model';
import type { ViewTemplateLock } from '@pryzm/core-app-model';

// ── Helpers ──────────────────────────────────────────────────────────────

const MIGRATED_INTENT_PREFIX = 'migrated-vt-';

const VIEW_TEMPLATE_LOCK_TO_SEED_FIELD: Partial<Record<keyof ViewTemplateLock, ViewSeedLockableField>> = {
    scale:        'scale',
    detailLevel:  'detailLevel',
    visualStyle:  'visualStyle',
    discipline:   'discipline',
    phaseFilter:  'phase',
    crop:         'cropActive',
};

function templateLockedFieldsToSeed(lockedFields: (keyof ViewTemplateLock)[] | undefined): ViewSeedLockableField[] | undefined {
    if (!lockedFields || lockedFields.length === 0) return undefined;
    const out: ViewSeedLockableField[] = [];
    for (const lf of lockedFields) {
        const mapped = VIEW_TEMPLATE_LOCK_TO_SEED_FIELD[lf];
        if (mapped && !out.includes(mapped)) out.push(mapped);
    }
    return out.length > 0 ? out : undefined;
}

function templateDisciplineToSeed(discipline: ViewTemplate['discipline']): ViewSeedDiscipline | undefined {
    if (!discipline) return undefined;
    return discipline as ViewSeedDiscipline;
}

function templatePurposeToSeed(rawPurpose: unknown): ViewSeedPurpose | undefined {
    if (typeof rawPurpose !== 'string') return undefined;
    const allowed: ViewSeedPurpose[] = [
        'construction-docs', 'design-development', 'schematic-design',
        'as-built', 'coordination', 'presentation',
    ];
    return (allowed as string[]).includes(rawPurpose) ? (rawPurpose as ViewSeedPurpose) : undefined;
}

/**
 * Builds a ViewSeed payload from a legacy ViewTemplate.
 * Pure — exported for unit testing.
 */
export function buildViewSeedFromTemplate(template: ViewTemplate): ViewSeed {
    const seed: ViewSeed = {
        nameTemplate: template.name,
        discipline:   templateDisciplineToSeed(template.discipline),
        purpose:      templatePurposeToSeed((template.output as any)?.purpose),
        defaultPhase: (template.temporal as any)?.phaseFilterId
            ?? (template.temporal as any)?.phaseFilter
            ?? undefined,
        initialScale: (template.output as any)?.scale,
        initialLevel: 'auto',
        lockedFields: templateLockedFieldsToSeed(template.lockedFields),
    };
    // Strip undefined keys so JSON snapshots stay clean.
    return Object.fromEntries(
        Object.entries(seed).filter(([, v]) => v !== undefined)
    ) as ViewSeed;
}

/**
 * Builds the absorbed VisibilityIntent for a single template.
 * Pure — exported for unit testing.
 */
export function buildIntentFromTemplate(template: ViewTemplate): VisibilityIntent {
    const now = new Date().toISOString();
    return {
        id:            `${MIGRATED_INTENT_PREFIX}${template.id}`,
        schemaVersion: CURRENT_INTENT_SCHEMA_VERSION,
        name:          template.name,
        description:   template.description ?? `Migrated from view template '${template.name}'.`,
        version:       1,
        isSystem:      false,
        createdAt:     now,
        updatedAt:     now,
        elementRules:  cloneDefaultElementGraphicsRules(),
        viewTypeModifiers: [],
        purposeModifiers:  [],
        viewSeed:      buildViewSeedFromTemplate(template),
    };
}

// ── Idempotence guard ────────────────────────────────────────────────────

/**
 * Returns true if any template has already been migrated in a prior session.
 * Used by ProjectLoader to skip the migration on every subsequent load.
 */
export function isViewTemplateMigrationComplete(): boolean {
    return visibilityIntentStore.getAll()
        .some(i => i.id.startsWith(MIGRATED_INTENT_PREFIX));
}

// ── Migration entry point ────────────────────────────────────────────────

export interface ViewTemplateMigrationResult {
    /** Number of new intents created from templates. */
    intentCount: number;
    /** Number of views re-bound to a migrated intent. */
    viewCount: number;
    /** Number of templates skipped because their migrated intent already existed. */
    skippedCount: number;
}

/**
 * Reads `viewTemplateStore.getAll()`, creates one absorbed intent per template,
 * and rebinds every previously template-bound view to the new intent.
 *
 * Optionally takes a `viewLookup` callback so tests can inject a deterministic
 * `(templateId) => viewIds[]` mapping without standing up the full
 * ViewDefinitionStore. In production the callback walks
 * `window.viewDefinitionStore.getAll()`. // TODO(TASK-08)
 */
export function runViewTemplateToIntentMigration(
    viewLookup?: (templateId: string) => string[],
): ViewTemplateMigrationResult {
    if (isViewTemplateMigrationComplete()) {
        console.log('[ViewTemplateToIntentMigration] Already complete — skipping.');
        return { intentCount: 0, viewCount: 0, skippedCount: 0 };
    }

    const templates = viewTemplateStore.getAll();
    if (templates.length === 0) {
        return { intentCount: 0, viewCount: 0, skippedCount: 0 };
    }

    console.log(`[ViewTemplateToIntentMigration] Absorbing ${templates.length} view template(s) into intents…`);

    let intentCount = 0;
    let viewCount = 0;
    let skippedCount = 0;

    const lookup = viewLookup ?? defaultViewLookup;

    for (const template of templates) {
        const intent = buildIntentFromTemplate(template);

        const existing = visibilityIntentStore.get?.(intent.id);
        if (existing) {
            skippedCount++;
            continue;
        }

        const created = visibilityIntentStore.create(intent);
        if (!created) {
            skippedCount++;
            continue;
        }
        intentCount++;
        console.log(`[ViewTemplateToIntentMigration] Created intent '${intent.name}' (${intent.id}) from template '${template.name}'`);

        const viewIds = lookup(template.id);
        for (const viewId of viewIds) {
            const inst = viewIntentInstanceStore.assign(viewId, intent.id);
            if (inst) viewCount++;
        }
    }

    console.log(
        `[ViewTemplateToIntentMigration] Complete — ${intentCount} intents, ${viewCount} view bindings, ${skippedCount} skipped.`
    );

    return { intentCount, viewCount, skippedCount };
}

function defaultViewLookup(templateId: string): string[] {
    const store = (globalThis as any).window?.viewDefinitionStore
        ?? (globalThis as any).viewDefinitionStore;
    if (!store?.getAll) return [];
    try {
        return store.getAll()
            .filter((v: any) => v?.viewTemplateId === templateId)
            .map((v: any) => v.id);
    } catch {
        return [];
    }
}
