// ViewDefinition — Zod schema for a single view.
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S17 lines 818-834.
// ADR: `docs/02-decisions/adrs/0016-view-state-command-driven.md` §"Decision".
//
// 'plan' / 'section' kinds land in 2A / 2B — see ADR-0016 §"Forward
// compatibility" for the discriminated-union extension path.  In S17 we
// ship the 3D-perspective + 3D-orthographic kinds only.
//
// Refinement layer:
//   * If kind === '3d-perspective', `camera.fovDeg` MUST be provided.
//   * If kind === '3d-orthographic', `camera.orthoSize` MUST be provided.
// We express this as a top-level `.refine()` so a single Zod parse
// returns one error per violated invariant (cleaner UX than two
// discriminated-union branches that each lose context on the other).

import { z } from 'zod';

const Vec3 = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const ViewKindEnum = z.enum(['3d-perspective', '3d-orthographic']);
export type ViewKind = z.infer<typeof ViewKindEnum>;

export const RenderModeEnum = z.enum(['shaded', 'wireframe', 'shaded-with-edges']);
export type RenderMode = z.infer<typeof RenderModeEnum>;

/** Branded view-id (string at runtime; nominally typed in TS). */
export type ViewId = string & { readonly __brand: 'ViewId' };
/** Branded level-id (forward-declared here; LevelStore lands S18+). */
export type LevelId = string & { readonly __brand: 'LevelId' };

const ViewDefinitionShape = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: ViewKindEnum,
  camera: z.object({
    position: Vec3,
    target: Vec3,
    up: Vec3,
    fovDeg: z.number().min(10).max(120).optional(),
    orthoSize: z.number().positive().optional(),
  }),
  renderMode: RenderModeEnum,
  levelFilter: z.array(z.string().min(1)).nullable(),
  elementKindFilter: z.array(z.string().min(1)).nullable(),
});

export const ViewDefinitionSchema = ViewDefinitionShape.superRefine((v, ctx) => {
  if (v.kind === '3d-perspective' && v.camera.fovDeg === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['camera', 'fovDeg'],
      message: '3d-perspective views require camera.fovDeg.',
    });
  }
  if (v.kind === '3d-orthographic' && v.camera.orthoSize === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['camera', 'orthoSize'],
      message: '3d-orthographic views require camera.orthoSize.',
    });
  }
});

export type ViewDefinition = z.infer<typeof ViewDefinitionSchema> & {
  readonly id: ViewId;
};
