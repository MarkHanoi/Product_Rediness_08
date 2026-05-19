// FIXTURE — `pryzm/no-three-outside-committer` MUST fire here.
// Run via tools/scripts/check-lint-fixtures.mjs under a synthetic path
// outside the committer allowlist (e.g. `packages/some-other/src/Bad.ts`).

// 1) static `import * as THREE from 'three'`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as THREE from 'three';

// 2) named import from a `three/` subpath
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// 3) dynamic import — `import('three')`
async function loadDynamic() {
  const mod = await import('three');
  return mod;
}

// 4) CommonJS require (still appears in legacy code paths)
// eslint-disable-next-line @typescript-eslint/no-var-requires, no-undef
const T = require('three');

void THREE;
void OrbitControls;
void loadDynamic;
void T;
