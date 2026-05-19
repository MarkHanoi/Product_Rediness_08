/**
 * tests/viewTemplateToIntent.spec.test.ts
 *
 * Master Implementation Plan Wave 1 / Stage P0 — pure-helper smoke tests for
 * `src/migration/ViewTemplateToIntentMigration.ts`. The full end-to-end
 * migration that mutates the singleton stores is exercised by an integration
 * harness in a follow-up commit; here we only assert that the pure shape
 * mappers (template → ViewSeed → VisibilityIntent) behave per the contract in
 * §19.2 of the master plan.
 *
 * Run with:  node --test tests/viewTemplateToIntent.spec.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildViewSeedFromTemplate,
    buildIntentFromTemplate,
} from '../src/migration/ViewTemplateToIntentMigration';
import { CURRENT_INTENT_SCHEMA_VERSION } from '../src/core/presentation/migrations/IntentSchemaMigrations';
import type { ViewTemplate } from '../src/core/views/ViewTemplateTypes';

function makeTemplate(overrides: Partial<ViewTemplate> = {}): ViewTemplate {
    return {
        id:           'vt-fixture-1',
        name:         'Architectural Plan 1:50',
        description:  'Standard architectural plan',
        discipline:   'architecture',
        vgTemplateId: undefined,
        output:       { scale: 50, purpose: 'construction-docs' } as any,
        temporal:     { phaseFilterId: 'phase-new', phaseFilter: 'New Construction' } as any,
        annotationOverrides: undefined,
        rules:        [],
        lockedFields: ['scale', 'discipline', 'phaseFilter'] as any,
        intent:       'Issue-for-construction plans',
        metadata: {
            createdAt:  1700000000000,
            modifiedAt: 1700000000000,
            createdBy:  'test',
            version:    1,
        },
        ...overrides,
    };
}

test('buildViewSeedFromTemplate maps name/discipline/scale/purpose/phase/locks', () => {
    const seed = buildViewSeedFromTemplate(makeTemplate());

    assert.equal(seed.nameTemplate, 'Architectural Plan 1:50');
    assert.equal(seed.discipline, 'architecture');
    assert.equal(seed.purpose, 'construction-docs');
    assert.equal(seed.initialScale, 50);
    assert.equal(seed.defaultPhase, 'phase-new');
    assert.equal(seed.initialLevel, 'auto');
    assert.deepEqual(seed.lockedFields?.sort(), ['discipline', 'phase', 'scale']);
});

test('buildViewSeedFromTemplate omits undefined keys (clean JSON shape)', () => {
    const seed = buildViewSeedFromTemplate(makeTemplate({
        discipline:   undefined,
        output:       undefined,
        temporal:     undefined,
        lockedFields: [],
    }));

    assert.equal(seed.nameTemplate, 'Architectural Plan 1:50');
    assert.equal(seed.initialLevel, 'auto');
    assert.equal('discipline'   in seed, false);
    assert.equal('purpose'      in seed, false);
    assert.equal('initialScale' in seed, false);
    assert.equal('defaultPhase' in seed, false);
    assert.equal('lockedFields' in seed, false);
});

test('buildViewSeedFromTemplate falls back to legacy phaseFilter when phaseFilterId is absent', () => {
    const seed = buildViewSeedFromTemplate(makeTemplate({
        temporal: { phaseFilter: 'Existing' } as any,
    }));
    assert.equal(seed.defaultPhase, 'Existing');
});

test('buildViewSeedFromTemplate ignores unknown purpose strings', () => {
    const seed = buildViewSeedFromTemplate(makeTemplate({
        output: { scale: 100, purpose: 'made-up-purpose' } as any,
    }));
    assert.equal(seed.purpose, undefined);
    assert.equal(seed.initialScale, 100);
});

test('buildIntentFromTemplate produces a non-system intent at the current schema version', () => {
    const intent = buildIntentFromTemplate(makeTemplate());

    assert.equal(intent.id, 'migrated-vt-vt-fixture-1');
    assert.equal(intent.schemaVersion, CURRENT_INTENT_SCHEMA_VERSION);
    assert.equal(intent.isSystem, false);
    assert.equal(intent.version, 1);
    assert.equal(intent.name, 'Architectural Plan 1:50');
    assert.ok(intent.viewSeed, 'viewSeed must be present');
    assert.equal(intent.viewSeed?.initialScale, 50);
    assert.deepEqual(intent.viewTypeModifiers, []);
    assert.deepEqual(intent.purposeModifiers, []);
    assert.ok(typeof intent.elementRules === 'object' && intent.elementRules !== null,
        'elementRules must be initialised to default rules');
});

test('buildIntentFromTemplate is deterministic for the same input id', () => {
    const a = buildIntentFromTemplate(makeTemplate());
    const b = buildIntentFromTemplate(makeTemplate());
    assert.equal(a.id, b.id);
    assert.deepEqual(a.viewSeed, b.viewSeed);
});
