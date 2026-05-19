// LINT FIXTURE — INTENTIONALLY VIOLATES `pryzm/no-three-in-kernel`.
//
// This file lives under `packages/geometry-kernel/__fixtures__/` and
// matches the `**/*.bad.ts` global ignore pattern in
// `eslint.config.js`, so the standard CI lint pass DOES NOT lint it.
//
// `__tests__/lint-fixture.test.ts` runs ESLint programmatically against
// this file with the kernel rule turned on and asserts the violation
// fires — proving the rule's real-enforcement gate (S07-T3).

// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-restricted-imports
import * as THREE from 'three';

export const probe = THREE;
