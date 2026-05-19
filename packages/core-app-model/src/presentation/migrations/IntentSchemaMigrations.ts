/**
 * IntentSchemaMigrations — Stage S8.
 *
 * Versioned migration chain for VisibilityIntent records.  Each migrator is a
 * pure `(intent: any) => any` upgrading from version N to N+1.  The store calls
 * `migrateIntentToCurrent()` on every load; legacy rows lacking a
 * `schemaVersion` are treated as v1.
 *
 * Schema history:
 *   v1 — initial release.
 *   v2 — adds `purposeModifiers`, `planViewRange`. (additive; no transform required)
 *   v3 — adds `ifc-element` element rules + intent-aware IFC visibility (S7).
 *           No transform required either; missing rules fall back through
 *           IntentRuleResolver.rulesFor() → __default__.
 *   v4 — adds optional `viewSeed` block (Master Plan Wave 1 / Stage P0 — View
 *           Template absorption). Existing intents have no seed (appearance-only)
 *           so the migration is a no-op shape bump; the field is populated for
 *           specific intents by `runViewTemplateToIntentMigration()` at load.
 *   v5 — adds optional `viewTypeProfiles` block + `ElementGraphicsRules.visible`
 *           flag (Master Plan Wave 4 / Stages S3 + A4). Both fields are
 *           additive: the resolver treats absent profiles as a no-op merge and
 *           absent `visible` flags as `true`. Forward-migration of legacy
 *           `viewTypeModifiers` entries into equivalent `viewTypeProfiles`
 *           entries lands in Wave 4.5 (per-view-type accordion editor) — until
 *           then both shapes coexist and the resolver applies profiles before
 *           modifiers per the priority order documented in Contract 25 §5.
 */

export const CURRENT_INTENT_SCHEMA_VERSION = 5;

type Migrator = (intent: any) => any;

const MIGRATORS: Record<number, Migrator> = {
    1: (intent: any) => {
        // v1 → v2 — additive only.
        if (!intent.purposeModifiers) intent.purposeModifiers = [];
        return intent;
    },
    2: (intent: any) => {
        // v2 → v3 — additive only; ensure `ifc-element` key present (resolver
        // already falls back to __default__ when missing, so this is optional).
        return intent;
    },
    3: (intent: any) => {
        // v3 → v4 — additive only; `viewSeed` is optional. Legacy intents
        // remain appearance-only (no seed) and the new "Create View from
        // Intent" picker simply filters them out.
        return intent;
    },
    4: (intent: any) => {
        // v4 → v5 — additive only; `viewTypeProfiles` is optional and absent
        // profiles are a no-op in the resolver's priority-4000 merge step.
        // `ElementGraphicsRules.visible` defaults to `true` when omitted, so
        // legacy element-rule rows continue to render exactly as before.
        // Wave 4.5 will populate `viewTypeProfiles` from existing
        // `viewTypeModifiers` entries via a one-shot forward migration.
        return intent;
    },
};

export function migrateIntentToCurrent<T extends { schemaVersion?: number }>(intent: T): T & { schemaVersion: number } {
    let v = typeof intent.schemaVersion === 'number' ? intent.schemaVersion : 1;
    let next: any = { ...intent };
    while (v < CURRENT_INTENT_SCHEMA_VERSION) {
        const migrate = MIGRATORS[v];
        if (!migrate) break;
        try { next = migrate(next); } catch (err) {
            console.warn(`[IntentSchemaMigrations] v${v}→v${v + 1} failed`, err);
            break;
        }
        v += 1;
    }
    next.schemaVersion = v;
    return next;
}
