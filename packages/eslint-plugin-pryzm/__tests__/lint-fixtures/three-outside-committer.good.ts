// FIXTURE — `pryzm/no-three-outside-committer` MUST stay silent here.
// Run via tools/scripts/check-lint-fixtures.mjs under a synthetic path
// INSIDE the allowlist (e.g. `packages/scene-committer/src/Good.ts`).

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as THREE from '@pryzm/renderer-three/three';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Vector3 } from '@pryzm/renderer-three/three';

void THREE;
void Vector3;
