// apps/sync-server/bake/createBakeEnqueuer.ts — env-gated factory.
//
// Decision matrix:
//   ┌──────────────────────────────┬──────────────────────────────┐
//   │ env                          │ Selected enqueuer            │
//   ├──────────────────────────────┼──────────────────────────────┤
//   │ BAKE_URL=http://...          │ HttpBakeEnqueuer             │
//   │ default                      │ NoopBakeEnqueuer             │
//   └──────────────────────────────┴──────────────────────────────┘
//
// The InProcessBakeEnqueuer is intentionally NOT auto-selected — tests
// and benches construct it directly when they want to share a bake
// worker instance with the sync server in the same process.

import { HttpBakeEnqueuer } from './HttpBakeEnqueuer.js';
import { NoopBakeEnqueuer } from './NoopBakeEnqueuer.js';
import type { BakeEnqueuer } from './types.js';

export interface CreateBakeEnqueuerOptions {
  readonly env?: Record<string, string | undefined>;
  /** Test injection — bypasses the env-gated factory entirely. */
  readonly enqueuer?: BakeEnqueuer;
}

export interface BakeEnqueuerFactoryResult {
  readonly enqueuer: BakeEnqueuer;
  readonly selection: 'noop' | 'http';
  readonly reason: string;
}

export function createBakeEnqueuer(
  opts: CreateBakeEnqueuerOptions = {},
): BakeEnqueuerFactoryResult {
  if (opts.enqueuer) {
    return { enqueuer: opts.enqueuer, selection: 'noop', reason: 'injected by caller' };
  }
  const env = opts.env ?? process.env;
  const url = env.BAKE_URL;
  if (url) {
    return {
      enqueuer: new HttpBakeEnqueuer({ baseUrl: url }),
      selection: 'http',
      reason: `BAKE_URL=${url}`,
    };
  }
  return {
    enqueuer: new NoopBakeEnqueuer(),
    selection: 'noop',
    reason: 'BAKE_URL unset — bake jobs are no-ops',
  };
}
