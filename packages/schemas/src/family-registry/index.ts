// P0.3 slice A (Family Platform) — public surface for the L0 FamilyRegistry
// substrate.  Re-exported through the root barrel (`@pryzm/schemas`).  A
// later slice may add a `./family-registry` subpath entry in
// `package.json` to mirror the annotation/view/apartment supplements.
//
// Slice A contents:
//   - identity:           FamilyIdentitySchema, FamilyId, FAMILY_VERSION_PATTERN
//   - registered-family:  RegisteredFamilySchema + the enum / sub-schemas it composes
//   - registry:           FamilyRegistryStateSchema + pure register/unregister/find helpers
//
// Deferred to later slices: builderRef, planSymbolRef, footprint,
// uiDescriptor, aiVocabulary, permissions, and the L3 store wrapper.

export * from './identity.js';
export * from './registered-family.js';
export * from './registry.js';
