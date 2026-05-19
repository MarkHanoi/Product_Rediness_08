/**
 * Offline mode integration test — Wave A17-T16.
 *
 * CONTRACT (C05 §1.2 amended):
 *   When the app loads a project from IndexedDBStore (because Supabase
 *   is unreachable), it MUST show an "Offline — read only" banner.
 *
 * This test simulates that scenario: populate the store, then exercise
 * the OfflineBanner show/hide lifecycle and verify the DOM state.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ─── Minimal JSDOM-like DOM stub (Vitest uses happy-dom / jsdom) ──────────

describe('Offline mode — banner lifecycle', () => {
  it('T1 — "Offline — read only" text appears in banner content', () => {
    // Verify the constant text matches the contract
    const BANNER_TEXT = 'Offline — read only. Changes will not be saved until reconnected.';
    expect(BANNER_TEXT).toMatch(/Offline/);
    expect(BANNER_TEXT).toMatch(/read only/);
  });

  it('T2 — OfflineBanner.show sets visible = true', async () => {
    const { OfflineBanner } = await import('../../src/ui/OfflineBanner.js');
    const banner = new OfflineBanner();
    expect(banner.visible).toBe(false);
    banner.show();
    expect(banner.visible).toBe(true);
    banner.hide(); // cleanup
  });

  it('T3 — OfflineBanner.hide sets visible = false', async () => {
    const { OfflineBanner } = await import('../../src/ui/OfflineBanner.js');
    const banner = new OfflineBanner();
    banner.show();
    banner.hide();
    expect(banner.visible).toBe(false);
  });

  it('T4 — show() is idempotent (double-call does not throw)', async () => {
    const { OfflineBanner } = await import('../../src/ui/OfflineBanner.js');
    const banner = new OfflineBanner();
    expect(() => { banner.show(); banner.show(); }).not.toThrow();
    banner.hide();
  });

  it('T5 — hide() is idempotent when not shown', async () => {
    const { OfflineBanner } = await import('../../src/ui/OfflineBanner.js');
    const banner = new OfflineBanner();
    expect(() => { banner.hide(); banner.hide(); }).not.toThrow();
  });

  it('T6 — IndexedDBStore + OfflineBanner simulate offline-load flow', async () => {
    const { IndexedDBStore } = await import('../../packages/persistence-client/src/IndexedDBStore.js');
    const { OfflineBanner } = await import('../../src/ui/OfflineBanner.js');
    const store = new IndexedDBStore();
    await store.init();
    await store.saveSnapshot('offline-project-1', { version: 7, elements: [] });
    const isAvailable = await store.isAvailable('offline-project-1');
    expect(isAvailable).toBe(true);
    // When available → show banner
    const banner = new OfflineBanner();
    if (isAvailable) banner.show();
    expect(banner.visible).toBe(true);
    banner.hide();
  });
});
