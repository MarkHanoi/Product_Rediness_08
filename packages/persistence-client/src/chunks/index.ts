// chunks/ — content-addressed binary chunk pipeline.  S19 deliverable.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` §S19.

export {
  ChunkWriter,
  type ChunkGeometryDescriptor,
  type ChunkWriteInput,
  type ChunkWriteOptions,
  type ChunkWriteResult,
} from './ChunkWriter.js';

export {
  ChunkReader,
  ChunkHashMismatchError,
  type ChunkReadDescriptor,
  type ChunkReadInput,
  type ChunkReadResult,
} from './ChunkReader.js';

export {
  InMemoryChunkStore,
  IndexedDbChunkStore,
  IDB_CHUNKS_DB_NAME_PREFIX,
  IDB_CHUNKS_DB_VERSION,
  IDB_CHUNKS_STORE,
  type ChunkStore,
  type ChunkRecord,
  type IndexedDbChunkStoreOptions,
} from './ChunkStore.js';

export {
  hydrateFromChunk,
  type HydrateFromChunkInput,
  type HydratedChunk,
} from './HydrateFromChunk.js';
