// 12 system view templates (post-2B closeout / Track C closure).
//
// Spec source:
//   • `phases/PHASE-2B-SUPPLEMENT-AUTODIM-VIEWTEMPLATE.md` Track C — calls
//     for a seed of system templates (`isSystemTemplate: true`) shipping
//     with PRYZM out-of-the-box.  The 12 names follow the supplement.
//   • Post-2B closeout ADR-0030 §2.4 row "system-templates seed".
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure data — every entry is a plain object that round-trips through
//   `ViewTemplateSchema.parse`.  Constructed at module load time and
//   frozen.
// • All entries set `isSystemTemplate: true`.
// • The 12 names below match the supplement; the depth of each template
//   (which categories are visible / hidden / overridden) is calibrated
//   to be useful out-of-the-box; depth-tuning is a follow-up project
//   task (see ADR-0030 §2.5).

import {
  ViewTemplateSchema,
  type ElementCategory,
  type ViewTemplate,
  type ViewType,
} from './view-template.js';

interface SeedSpec {
  readonly id: string;
  readonly name: string;
  readonly viewType: ViewType;
  /** Categories explicitly hidden in this template.  Categories not listed
   *  fall back to default (visible). */
  readonly hide?: readonly ElementCategory[];
  /** Categories explicitly halftoned in this template. */
  readonly halftone?: readonly ElementCategory[];
}

const SEEDS: readonly SeedSpec[] = [
  // Floor plans -------------------------------------------------------------
  {
    id: 'system:floor-plan-architectural',
    name: 'Floor Plan — Architectural',
    viewType: 'plan',
    hide: ['Structural', 'MEPElectrical', 'MEPPlumbing', 'MEPMechanical'],
  },
  {
    id: 'system:floor-plan-furniture',
    name: 'Floor Plan — Furniture',
    viewType: 'plan',
    hide: ['Structural', 'MEPElectrical', 'MEPPlumbing', 'MEPMechanical'],
    halftone: ['Wall', 'Door', 'Window'],
  },
  {
    id: 'system:floor-plan-power',
    name: 'Floor Plan — Power',
    viewType: 'plan',
    hide: ['Furniture', 'MEPPlumbing', 'MEPMechanical', 'Structural'],
    halftone: ['Wall', 'Door', 'Window'],
  },
  {
    id: 'system:floor-plan-lighting',
    name: 'Floor Plan — Lighting',
    viewType: 'plan',
    hide: ['Furniture', 'MEPPlumbing', 'MEPMechanical', 'Structural'],
    halftone: ['Wall', 'Door', 'Window'],
  },
  // Reflected ceiling plans -------------------------------------------------
  {
    id: 'system:rcp-architectural',
    name: 'RCP — Architectural',
    viewType: 'rcp',
    hide: ['Furniture', 'MEPPlumbing'],
  },
  {
    id: 'system:rcp-power',
    name: 'RCP — Power',
    viewType: 'rcp',
    hide: ['Furniture', 'MEPPlumbing', 'MEPMechanical'],
    halftone: ['Wall'],
  },
  // Sections ----------------------------------------------------------------
  {
    id: 'system:section-architectural',
    name: 'Section — Architectural',
    viewType: 'section',
    hide: ['Furniture', 'MEPElectrical', 'MEPPlumbing', 'MEPMechanical'],
  },
  {
    id: 'system:section-structural',
    name: 'Section — Structural',
    viewType: 'section',
    hide: ['Furniture', 'MEPElectrical', 'MEPPlumbing', 'MEPMechanical'],
    halftone: ['Wall', 'Door', 'Window'],
  },
  // Elevations --------------------------------------------------------------
  {
    id: 'system:elevation-exterior',
    name: 'Elevation — Exterior',
    viewType: 'elevation',
    hide: ['Furniture', 'MEPElectrical', 'MEPPlumbing', 'MEPMechanical'],
  },
  {
    id: 'system:elevation-interior',
    name: 'Elevation — Interior',
    viewType: 'elevation',
    hide: ['MEPElectrical', 'MEPPlumbing', 'MEPMechanical'],
  },
  // Site & coordination ----------------------------------------------------
  {
    id: 'system:site-plan',
    name: 'Site Plan',
    viewType: 'plan',
    hide: ['Furniture', 'MEPElectrical', 'MEPPlumbing', 'MEPMechanical', 'Structural', 'Door', 'Window'],
    halftone: ['Wall'],
  },
  {
    id: 'system:coordination-3d',
    name: 'Coordination — 3D Overview',
    viewType: 'plan',
    halftone: ['Wall', 'Door', 'Window'],
  },
];

function buildTemplate(seed: SeedSpec): ViewTemplate {
  const categoryOverrides: Partial<Record<ElementCategory, unknown>> = {};
  for (const cat of seed.hide ?? []) {
    categoryOverrides[cat] = { visible: false };
  }
  for (const cat of seed.halftone ?? []) {
    const existing = categoryOverrides[cat] as Record<string, unknown> | undefined;
    categoryOverrides[cat] = { ...(existing ?? {}), halftone: true };
  }
  return ViewTemplateSchema.parse({
    id: seed.id,
    name: seed.name,
    viewType: seed.viewType,
    isSystemTemplate: true,
    categoryOverrides,
    filters: [],
  });
}

/** All 12 system templates, frozen.  Order is stable and matches the
 *  declaration order above. */
export const SYSTEM_VIEW_TEMPLATES: readonly ViewTemplate[] = Object.freeze(
  SEEDS.map(buildTemplate),
);

/** Lookup helper. */
export function getSystemViewTemplate(id: string): ViewTemplate | undefined {
  return SYSTEM_VIEW_TEMPLATES.find((t) => t.id === id);
}

/** All system template ids (stable). */
export function listSystemViewTemplateIds(): readonly string[] {
  return SYSTEM_VIEW_TEMPLATES.map((t) => t.id);
}
