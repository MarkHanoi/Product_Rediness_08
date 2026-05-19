// InMemoryStorageDriver + createStorageDriver factory tests (S21 D4).
//
// Covers the `[strategic ADR-003]` storage driver contract plus the
// env-gated factory so that:
//   • Round-trip put → get returns identical bytes.
//   • Idempotent put on the same hash counts as 2 ops but stores 1 copy.
//   • get() on a missing hash throws `StorageObjectNotFoundError`.
//   • stats() tracks bytes + ops faithfully (used by the bake worker
//     CostMeter for `bake.event.cost` telemetry).
//   • createStorageDriver respects forceInMemory + STORAGE_DRIVER env +
//     full R2_* env set.

import { describe, expect, it } from 'vitest';
import {
  InMemoryStorageDriver,
  StorageObjectNotFoundError,
  createStorageDriver,
  R2StorageDriver,
} from '../src/index.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('InMemoryStorageDriver', () => {
  it('round-trips bytes through put → get', async () => {
    const d = new InMemoryStorageDriver();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await d.put(HASH_A, bytes);
    const out = await d.get(HASH_A);
    expect(out).toEqual(bytes);
  });

  it('put is idempotent on the same hash', async () => {
    const d = new InMemoryStorageDriver();
    const bytes = new Uint8Array([1, 2, 3]);
    await d.put(HASH_A, bytes);
    await d.put(HASH_A, bytes);
    expect(d.size()).toBe(1);
    expect(d.stats().puts).toBe(2); // both ops counted toward billing
  });

  it('throws StorageObjectNotFoundError for missing hash', async () => {
    const d = new InMemoryStorageDriver();
    await expect(d.get(HASH_A)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });

  it('has() returns true after put, false otherwise', async () => {
    const d = new InMemoryStorageDriver();
    expect(await d.has(HASH_A)).toBe(false);
    await d.put(HASH_A, new Uint8Array([7]));
    expect(await d.has(HASH_A)).toBe(true);
    expect(d.stats().heads).toBe(2);
  });

  it('mints a deterministic mem:// signed URL', async () => {
    const d = new InMemoryStorageDriver();
    const url = await d.getSignedUrl(HASH_A, 3600);
    expect(url).toBe(`mem://${HASH_A}`);
  });

  it('tracks bytes uploaded + downloaded', async () => {
    const d = new InMemoryStorageDriver();
    await d.put(HASH_A, new Uint8Array(100));
    await d.put(HASH_B, new Uint8Array(50));
    await d.get(HASH_A);
    const s = d.stats();
    expect(s.bytesPut).toBe(150);
    expect(s.bytesGet).toBe(100);
    expect(s.puts).toBe(2);
    expect(s.gets).toBe(1);
  });

  it('seed pre-populates from a Map', async () => {
    const seed = new Map([[HASH_A, new Uint8Array([9, 9, 9])]]);
    const d = new InMemoryStorageDriver({ seed });
    expect(await d.has(HASH_A)).toBe(true);
    expect(await d.get(HASH_A)).toEqual(new Uint8Array([9, 9, 9]));
  });

  it('dispose() clears storage and rejects subsequent ops', async () => {
    const d = new InMemoryStorageDriver();
    await d.put(HASH_A, new Uint8Array([1]));
    await d.dispose();
    expect(d.size()).toBe(0);
    await expect(d.put(HASH_A, new Uint8Array([1]))).rejects.toThrow(/disposed/);
  });
});

describe('createStorageDriver factory', () => {
  it('returns InMemory when no R2 env vars are set', () => {
    const result = createStorageDriver({ env: {} });
    expect(result.selection).toBe('memory');
    expect(result.driver).toBeInstanceOf(InMemoryStorageDriver);
  });

  it('returns InMemory when STORAGE_DRIVER=memory regardless of R2 vars', () => {
    const result = createStorageDriver({
      env: {
        STORAGE_DRIVER: 'memory',
        R2_ACCOUNT_ID: 'x',
        R2_ACCESS_KEY_ID: 'x',
        R2_SECRET_ACCESS_KEY: 'x',
        R2_BUCKET_NAME: 'x',
      },
    });
    expect(result.selection).toBe('memory');
  });

  it('returns InMemory when forceInMemory is set', () => {
    const result = createStorageDriver({ forceInMemory: true });
    expect(result.selection).toBe('memory');
  });

  it('returns R2StorageDriver when all four R2_* env vars are set', () => {
    const result = createStorageDriver({
      env: {
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET_NAME: 'bucket',
      },
    });
    expect(result.selection).toBe('r2');
    expect(result.driver).toBeInstanceOf(R2StorageDriver);
    expect(result.reason).toContain('bucket');
  });

  it('R2StorageDriver throws clear error when @aws-sdk/client-s3 is not installed', async () => {
    const r2 = new R2StorageDriver({
      accountId: 'a',
      accessKeyId: 'k',
      secretAccessKey: 's',
      bucketName: 'b',
    });
    await expect(r2.put('hash', new Uint8Array([1]))).rejects.toThrow(/aws-sdk/);
    await expect(r2.get('hash')).rejects.toThrow(/aws-sdk/);
  });

  it('R2StorageDriver constructor rejects missing fields', () => {
    expect(() => new R2StorageDriver({} as never)).toThrow(/accountId required/);
  });
});
