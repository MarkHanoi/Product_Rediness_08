// @pryzm/ai-worker — CV intermediate-artifact storage (S50 D4).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S50 lines 263-265 ("Upload mask + raw output for the next
// pipeline stage (vectorization in S55)"). The storage layer is
// abstracted as a porter so dev / tests use an in-memory map and
// production swaps in the R2 adapter.
//
// The R2 adapter is dynamically imported — `bullmq-queue.js`-style —
// so `@aws-sdk/client-s3` stays out of the worker's dep tree until
// the operator wires `R2_BUCKET`.

import type { CvEnv, StoragePorter } from './types.js';

let _seq = 0;
function nextKey(scope: string): string {
  return `${scope}-${Date.now().toString(36)}-${(++_seq).toString(36)}`;
}

/** In-memory storage porter for dev + tests. URLs are
 *  `mem://<projectId>/<key>` and the data lives on the porter
 *  instance — round-trip works as long as the same instance is
 *  used. */
export class InMemoryStorage implements StoragePorter {
  readonly inMemory = true as const;
  private readonly bucket = new Map<string, Uint8Array>();

  async upload(opts: {
    readonly projectId: string;
    readonly key: string;
    readonly contentType: string;
    readonly bytes: Uint8Array;
  }): Promise<string> {
    const url = `mem://${opts.projectId}/${opts.key}`;
    // Defensive copy so the caller can mutate its source buffer.
    this.bucket.set(url, new Uint8Array(opts.bytes));
    return url;
  }

  async fetch(url: string): Promise<Uint8Array> {
    const buf = this.bucket.get(url);
    if (!buf) {
      throw new Error(`[ai-worker/cv/storage] No object at ${url}`);
    }
    return new Uint8Array(buf);
  }

  /** Test helper — number of objects currently stored. */
  size(): number {
    return this.bucket.size;
  }

  /** Test helper — clear all objects. */
  _clear(): void {
    this.bucket.clear();
  }
}

/** Factory matching the `createQueue({env})` selection pattern. */
export async function createStorage(opts: {
  readonly env?: CvEnv;
} = {}): Promise<StoragePorter> {
  const env = opts.env ?? {};

  // Real R2 adapter — only attempted when the operator opts in via
  // R2_BUCKET. Absent in S50 (R2 not provisioned in dev); the
  // dynamic import keeps the AWS SDK out of the dep graph.
  if (env.R2_BUCKET && env.R2_BUCKET.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import(
        /* @vite-ignore */ './r2-storage.js' as string
      ).catch(() => null);
      if (mod?.createR2Storage) {
        return mod.createR2Storage({
          bucket: env.R2_BUCKET,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        }) as StoragePorter;
      }
    } catch {
      // Fall through.
    }
    throw new Error(
      '[ai-worker/cv/storage] R2_BUCKET is set but the R2 adapter '
      + 'is not installed in this build. R2 wiring lands at S52 per '
      + 'SPEC-45 §4. Unset R2_BUCKET to use the in-memory porter.',
    );
  }

  return new InMemoryStorage();
}

/** Convenience helper — generates a stable per-page key for the
 *  upload site so callers don't reinvent the naming scheme. */
export function maskKey(projectId: string, pageId: string): string {
  return `cv/masks/${pageId}-${nextKey(projectId).slice(-6)}.bin`;
}
