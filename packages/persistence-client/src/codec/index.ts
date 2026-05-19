// codec/ — lazy WASM compression singletons.  S19 deliverable.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` §S19
// D2 / D3 / D4 (lines 390–392).
//
// Each codec is fetched once per process via dynamic `import()` so the
// initial editor bundle stays under the < 200 KB gzip budget (S19 exit
// criterion line 409).  The singletons are shared across `ChunkWriter`
// and `ChunkReader`, and re-used by the S21 bake worker.

export {
  DRACO_DEFAULT_QUANTIZATION,
  getDracoEncoder,
  getDracoDecoder,
  isDracoAvailable,
  __resetDracoSingletons,
  type DracoQuantization,
} from './draco.js';

export {
  getMeshopt,
  getMeshoptEncoder,
  getMeshoptDecoder,
  isMeshoptAvailable,
  __resetMeshoptSingleton,
} from './meshopt.js';

export { Ktx2, type Ktx2Codec, type Ktx2EncodeOptions } from './ktx2.js';
