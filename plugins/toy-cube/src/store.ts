// CubeStore — toy-cube element store (S02 / dev-only demo).
//
// Wave 12 recipe completion: toy-cube plugin store.ts (previously missing).
//
// Wraps the CubesState record (Record<id, CubeState>) from MoveCubeCommand
// in a thin store class that the plugin's handler context can use.
// This is the dev-only smoke-test store — not used in production builds.

import { Store } from '@pryzm/plugin-sdk';
import type { CubeState } from './MoveCubeCommand.js';

export type { CubeState };

/**
 * CubeStore holds the position of every toy cube in the scene.
 * The MoveCubeCommand handler writes to ctx.stores.cube (typed
 * as CubesState = Record<string, CubeState>); this class provides
 * a richer read surface for the committer.
 */
export class CubeStore extends Store<CubeState> {
  constructor() {
    super('cube');
  }

  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  getPosition(id: string): Readonly<CubeState> | undefined {
    return this.state.get(id);
  }

  all(): readonly (CubeState & { id: string })[] {
    return [...this.state.entries()].map(([id, pos]) => ({ id, ...pos }));
  }
}
