// LANE A shim (F-P5-04 inversion, 2026-08-31): the real module moved to
// packages/core-app-model/src/annotations/AnnotationStore.ts. This file keeps the
// plugin's public surface and every relative `./subsystem/*` import working,
// routed through @pryzm/plugin-sdk (the blessed edge — never a direct
// core-app-model import, which would grow the sdk-bypass ratchet).
// Re-aliased back: the SDK exports the subsystem class as
// `AnnotationSubsystemStore` (the bare name at the SDK barrel is the
// @pryzm/stores Zustand DTO ledger — a DIFFERENT class). Consumers of THIS
// path keep the original `AnnotationStore` name; ONE instance either way.
export { AnnotationSubsystemStore as AnnotationStore, annotationStore } from '@pryzm/plugin-sdk';
