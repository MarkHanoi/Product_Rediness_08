// R2 driver smoke tests (W-07).
//
// What this covers:
//   1. Constructing the driver with the four required env vars
//      succeeds.
//   2. Without the env vars set, `R2_TEST_*`, the smoke is skipped
//      (CI without R2 creds stays green).
//   3. With them set, a real put/get round-trip against the live
//      R2/MinIO endpoint validates the wire-up.
//
// The non-skipped path requires `@aws-sdk/client-s3` to be installed
// AND `R2_TEST_ACCOUNT_ID`, `R2_TEST_ACCESS_KEY_ID`,
// `R2_TEST_SECRET_ACCESS_KEY`, `R2_TEST_BUCKET_NAME` set.  Production
// deploys hit those env vars (without the `_TEST_` prefix) via the
// `createStorageDriver()` factory; the test prefix lets CI opt in for
// just smoke without leaking prod creds.

import { describe, expect, it } from 'vitest';
import { R2StorageDriver } from '../src/R2StorageDriver.js';

const R2_ENV = {
  accountId: process.env['R2_TEST_ACCOUNT_ID'] ?? '',
  accessKeyId: process.env['R2_TEST_ACCESS_KEY_ID'] ?? '',
  secretAccessKey: process.env['R2_TEST_SECRET_ACCESS_KEY'] ?? '',
  bucketName: process.env['R2_TEST_BUCKET_NAME'] ?? '',
};

const HAS_LIVE_R2 = Object.values(R2_ENV).every((v) => v.length > 0);

describe('R2StorageDriver constructor (W-07)', () => {
  it('accepts the four required options', () => {
    expect(() => new R2StorageDriver({
      accountId: 'acc', accessKeyId: 'key', secretAccessKey: 'sec', bucketName: 'b',
    })).not.toThrow();
  });

  it('rejects missing accountId', () => {
    expect(() => new R2StorageDriver({
      accountId: '', accessKeyId: 'k', secretAccessKey: 's', bucketName: 'b',
    })).toThrow(/accountId required/);
  });

  it('rejects missing bucketName', () => {
    expect(() => new R2StorageDriver({
      accountId: 'a', accessKeyId: 'k', secretAccessKey: 's', bucketName: '',
    })).toThrow(/bucketName required/);
  });

  it('throws a deterministic install hint when @aws-sdk/client-s3 is absent', async () => {
    const drv = new R2StorageDriver({
      accountId: 'a', accessKeyId: 'k', secretAccessKey: 's', bucketName: 'b',
    });
    // The current (S21 v0) impl throws a not-installed error from
    // both put() and get() until the operator installs the peer dep.
    await expect(drv.put('hash', new Uint8Array([1, 2, 3]))).rejects.toThrow();
    await expect(drv.get('hash')).rejects.toThrow();
  });
});

describe.skipIf(!HAS_LIVE_R2)(
  'R2StorageDriver live smoke (W-07, requires R2_TEST_* env)',
  () => {
    it('round-trips a small payload', async () => {
      const drv = new R2StorageDriver(R2_ENV);
      const payload = new TextEncoder().encode(`pryzm-r2-smoke-${Date.now()}`);
      const hash = `smoke-${Date.now()}`;
      await drv.put(hash, payload);
      const got = await drv.get(hash);
      expect(new TextDecoder().decode(got)).toBe(new TextDecoder().decode(payload));
    }, 30_000);
  },
);
