// FIXTURE: lives under packages/geometry-kernel/ via the test driver.
// `pryzm/no-three-in-kernel` MUST flag the THREE import.
// The kernel is pure — THREE belongs in the scene-committer.
import * as THREE from 'three';

export const banned = THREE;
