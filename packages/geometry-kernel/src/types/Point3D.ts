// Point3D — pure DTO shared by every kernel producer (ADR-009).
//
// Plain object literal with three finite numbers.  Mirrors
// `packages/schemas/src/base/primitives.ts → Vec3` at runtime so a
// `Vec3` instance is structurally a `Point3D`; we re-declare it here
// to avoid a runtime dependency from the kernel to `@pryzm/schemas`
// (which pulls in `zod`).

export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
