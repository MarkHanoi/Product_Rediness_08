// @pryzm/renderer-three — addon re-export: Rhino3dmLoader (.3dm import)
//
// Contract C04 §1.1 (P2): packages/renderer-three/ is the sole authorised owner
// of `three` and `three/*` specifiers. Consumers (here: @pryzm/file-format's
// RhinoImporter) must reach the loader through the '@pryzm/renderer-three'
// barrel — never through 'three/examples/jsm/loaders/3DMLoader.js' directly.
//
// The loader pulls the rhino3dm WebAssembly module at runtime; callers are
// expected to keep loading it lazily (`await import('@pryzm/renderer-three')`)
// so the wasm bridge stays out of the initial bundle.
export { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';
