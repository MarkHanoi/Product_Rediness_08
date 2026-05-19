/**
 * BuiltinTemplates.ts — PRYZM Pre-Built Template Library
 *
 * Phase:   G-0.1 (World Model Plan V3 — immediate sprint)
 * Contract: docs/00_PRZYM/PRYZM_World_Model_Plan_V3_Complete.md §G-0.1
 *
 * 15 pre-built templates spanning Healthcare, Office, Residential, and Education.
 * Seeded into TemplateStore on first load when store is empty (no user templates yet).
 * All templates carry the `builtin: true` flag so they can be filtered separately.
 *
 * Seeding wired via: TemplateStore.seedBuiltins() called from initDataPlatform after
 * project load when templateStore.count() === 0.
 */

import type { TemplateDefinition } from './TemplateTypes';

const NOW = 0;

function builtin(
    id: string,
    name: string,
    code: string,
    category: string,
    regulation: string | undefined,
    requirements: TemplateDefinition['requirements'],
): TemplateDefinition {
    return {
        id,
        scope: 'room',
        name,
        code,
        description: regulation ? `${category} — ${regulation}` : category,
        version: 1,
        isShared: false,
        requirements,
        metadata: {
            createdAt: NOW,
            createdBy: 'system',
            modifiedAt: NOW,
            modifiedBy: 'system',
            tags: ['builtin', category.toLowerCase()],
        },
    };
}

export const BUILTIN_TEMPLATES: TemplateDefinition[] = [

    // ── HEALTHCARE (NHS HTM 04-01) ────────────────────────────────────────────

    builtin(
        'builtin-hc-ward-single-bed',
        'Ward — Single Bed Room',
        'HC-WARD-SGL',
        'Healthcare',
        'NHS HTM 04-01',
        {
            targetArea: { minimum: 12.0, target: 14.4, tolerancePercent: 5 },
            windowRequirements: [{ minimumCount: 1 }],
            doorRequirements: [{ minimumCount: 1, minimumWidthMm: 1000 } as any],
        },
    ),

    builtin(
        'builtin-hc-icu-bay',
        'ICU Bay',
        'HC-ICU-BAY',
        'Healthcare',
        'NHS HTM 04-01',
        {
            targetArea: { minimum: 25.0, target: 28.0, tolerancePercent: 5 },
            doorRequirements: [{ minimumCount: 1, minimumWidthMm: 1200 } as any],
        },
    ),

    builtin(
        'builtin-hc-consulting-room',
        'Consulting Room',
        'HC-CONSULT',
        'Healthcare',
        'NHS HTM 04-01',
        {
            targetArea: { minimum: 16.0, target: 20.0, tolerancePercent: 5 },
            windowRequirements: [{ minimumCount: 1 }],
            doorRequirements: [{ minimumCount: 1 }],
        },
    ),

    builtin(
        'builtin-hc-clean-utility',
        'Clean Utility',
        'HC-UTIL-CLN',
        'Healthcare',
        undefined,
        {
            targetArea: { minimum: 8.0, target: 10.0, tolerancePercent: 10 },
        },
    ),

    builtin(
        'builtin-hc-wc-accessible',
        'Accessible WC',
        'HC-WC-ACCESS',
        'Healthcare',
        'Building Regs Part M §5.3',
        {
            targetArea: { minimum: 4.5, target: 5.5, tolerancePercent: 5 },
            equipmentRequirements: [
                { equipmentType: 'wc', requiredCount: 1 },
                { equipmentType: 'wash-basin', requiredCount: 1 },
            ],
        },
    ),

    // ── OFFICE ────────────────────────────────────────────────────────────────

    builtin(
        'builtin-ofc-open-plan',
        'Open Plan Office',
        'OFC-OPEN',
        'Office',
        undefined,
        {
            targetArea: { minimum: 10.0, target: 20.0, tolerancePercent: 15 },
            windowRequirements: [{ minimumCount: 1, minimumGlazingRatio: 0.10 }],
        },
    ),

    builtin(
        'builtin-ofc-meeting-room',
        'Meeting Room (8 person)',
        'OFC-MTG-8',
        'Office',
        undefined,
        {
            targetArea: { minimum: 20.0, target: 25.0, tolerancePercent: 10 },
            windowRequirements: [{ minimumCount: 1 }],
            doorRequirements: [{ minimumCount: 1 }],
        },
    ),

    builtin(
        'builtin-ofc-private-office',
        'Private Office',
        'OFC-PRIV',
        'Office',
        undefined,
        {
            targetArea: { minimum: 9.0, target: 12.0, tolerancePercent: 10 },
            windowRequirements: [{ minimumCount: 1 }],
        },
    ),

    // ── RESIDENTIAL (NDSS) ───────────────────────────────────────────────────

    builtin(
        'builtin-res-unit-1b',
        'Residential Unit — 1 Bed',
        'RES-UNIT-1B',
        'Residential',
        'Nationally Described Space Standard',
        {
            targetArea: { minimum: 37.0, target: 45.0, tolerancePercent: 5 },
        },
    ),

    builtin(
        'builtin-res-bedroom-single',
        'Single Bedroom',
        'RES-BED-SGL',
        'Residential',
        'Building Regs Part M / NDSS',
        {
            targetArea: { minimum: 7.5, target: 10.0, tolerancePercent: 5 },
            windowRequirements: [{ minimumCount: 1 }],
        },
    ),

    builtin(
        'builtin-res-bedroom-double',
        'Double Bedroom',
        'RES-BED-DBL',
        'Residential',
        'NDSS',
        {
            targetArea: { minimum: 11.5, target: 14.0, tolerancePercent: 5 },
            windowRequirements: [{ minimumCount: 1 }],
        },
    ),

    builtin(
        'builtin-res-bathroom',
        'Bathroom / En-suite',
        'RES-BATH',
        'Residential',
        undefined,
        {
            targetArea: { minimum: 3.2, target: 4.5, tolerancePercent: 10 },
            equipmentRequirements: [
                { equipmentType: 'wc', requiredCount: 1 },
                { equipmentType: 'wash-basin', requiredCount: 1 },
            ],
        },
    ),

    // ── EDUCATION (BB98) ─────────────────────────────────────────────────────

    builtin(
        'builtin-edu-classroom-30',
        'Classroom (30 pupils)',
        'EDU-CLS-30',
        'Education',
        'Building Bulletin BB98',
        {
            targetArea: { minimum: 55.0, target: 62.0, tolerancePercent: 5 },
            windowRequirements: [{ minimumCount: 2, minimumGlazingRatio: 0.15 }],
            doorRequirements: [{ minimumCount: 1 }],
        },
    ),

    builtin(
        'builtin-edu-classroom-15',
        'Small Teaching Room (15 pupils)',
        'EDU-CLS-15',
        'Education',
        'Building Bulletin BB98',
        {
            targetArea: { minimum: 32.0, target: 38.0, tolerancePercent: 5 },
            windowRequirements: [{ minimumCount: 1 }],
        },
    ),

    builtin(
        'builtin-edu-wc-accessible',
        'Accessible WC — School',
        'EDU-WC-ACCESS',
        'Education',
        'Building Regs Part M',
        {
            targetArea: { minimum: 4.5, target: 5.5, tolerancePercent: 5 },
            equipmentRequirements: [
                { equipmentType: 'wc', requiredCount: 1 },
                { equipmentType: 'wash-basin', requiredCount: 1 },
            ],
        },
    ),
];

/** Categories present in the builtin library (for picker grouping). */
export const BUILTIN_CATEGORIES = ['Healthcare', 'Office', 'Residential', 'Education'] as const;
export type BuiltinCategory = typeof BUILTIN_CATEGORIES[number];

/** Filter templates by category. */
export function getBuiltinsByCategory(category: BuiltinCategory): TemplateDefinition[] {
    return BUILTIN_TEMPLATES.filter(t => t.description?.startsWith(category));
}
