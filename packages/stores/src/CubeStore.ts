// CubeStore — the canonical Hello-Cube DTO store (~50 LOC per spec
// §S05-T2 line 507).
//
// Used as the fixture for:
//   * S05-T3 — stores ↔ command-bus integration tests.
//   * S05-T7 — 100-cube visual smoke test.
//   * S05-T9 — full-pipeline bench (handler → patch → store →
//     committer → registry).
//   * S06    — Hello Cube demo.
//
// The DTO is intentionally minimal — three numeric coordinates is enough
// to exercise add/update/remove + ref-counted material sharing.  The
// CubeCommitter (lives in `packages/scene-committer/__tests__/`) is the
// THREE side of the same fixture.

import { Store } from './Store.js';

export interface CubeDto {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class CubeStore extends Store<CubeDto> {
  constructor() {
    super('cube');
  }
}
