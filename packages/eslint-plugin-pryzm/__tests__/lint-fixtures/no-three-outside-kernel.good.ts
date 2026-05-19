// FIXTURE: lives under packages/scene-committer/ via the test driver.
// `pryzm/no-three-in-kernel` MUST NOT flag this — the rule only fires
// inside packages/geometry-kernel/.
import * as THREE from '@pryzm/renderer-three/three';

export const allowed = THREE;
