// LANE A shim (F-P5-04 inversion, 2026-08-31): the real module moved to
// packages/core-app-model/src/annotations/AnnotationVisibilityStore.ts. This file keeps the
// plugin's public surface and every relative `./subsystem/*` import working,
// routed through @pryzm/plugin-sdk (the blessed edge — never a direct
// core-app-model import, which would grow the sdk-bypass ratchet).
export { AnnotationVisibilityStore, annotationVisibilityStore } from '@pryzm/plugin-sdk';
