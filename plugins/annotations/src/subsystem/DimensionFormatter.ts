// LANE A shim (F-P5-04 inversion, 2026-08-31): the real module moved to
// packages/core-app-model/src/annotations/DimensionFormatter.ts. This file keeps the
// plugin's public surface and every relative `./subsystem/*` import working,
// routed through @pryzm/plugin-sdk (the blessed edge — never a direct
// core-app-model import, which would grow the sdk-bypass ratchet).
// Re-aliased back: the SDK exports this formatter as
// `formatAnnotationDimension` (the bare `formatDimension` at the SDK barrel is
// geometry-kernel's mm/UnitFormat evaluator — a DIFFERENT function; scout §2a).
export { type DimensionUnit, formatAnnotationDimension as formatDimension } from '@pryzm/plugin-sdk';
