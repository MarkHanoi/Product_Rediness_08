// UserPreferences — minimal localStorage-backed preference store that
// satisfies the `runtime.userPreferences` slot of `PryzmRuntime`.
//
// Phase A scope: provide the typed get/set/delete/subscribe surface so
// later phases can migrate the existing `UiPreferences` /
// `OwnerFeatureFlags` localStorage callers behind it without breaking
// signature compatibility.  Phase C.9.x routes the legacy callers
// through this slot.
//
// Storage policy: keys are namespaced under `'pryzm.pref.'` to avoid
// colliding with the existing PRYZM 1 localStorage keys
// (`bim-projects-index`, `bim-project-<id>-versions`, …) which remain
// owned by `ProjectRepository`.

import type { Disposable, UserPreferencesSlot } from './types.js';

const KEY_PREFIX = 'pryzm.pref.';

function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const probe = '__pryzm_pref_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export class UserPreferences implements UserPreferencesSlot {
  private readonly hasStorage: boolean = isStorageAvailable();
  private readonly fallback: Map<string, unknown> = new Map();
  private readonly subscribers: Map<string, Set<(value: unknown) => void>> = new Map();

  get<T>(key: string, fallback: T): T {
    if (this.hasStorage) {
      const raw = window.localStorage.getItem(KEY_PREFIX + key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    }
    if (this.fallback.has(key)) return this.fallback.get(key) as T;
    return fallback;
  }

  set<T>(key: string, value: T): void {
    if (this.hasStorage) {
      try {
        window.localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
      } catch (err) {
        // QuotaExceeded / SecurityError — fall back to the in-memory map
        // so the call still returns; the next reload will not see the
        // value but at least the in-process subscribers fire.
        console.warn('[runtime-composer/UserPreferences] storage write failed:', err);
        this.fallback.set(key, value);
      }
    } else {
      this.fallback.set(key, value);
    }
    this.notify(key, value);
  }

  delete(key: string): void {
    if (this.hasStorage) {
      window.localStorage.removeItem(KEY_PREFIX + key);
    }
    this.fallback.delete(key);
    this.notify(key, undefined);
  }

  subscribe<T>(key: string, listener: (value: T | undefined) => void): Disposable {
    let bucket = this.subscribers.get(key);
    if (bucket === undefined) {
      bucket = new Set();
      this.subscribers.set(key, bucket);
    }
    const wrapped = listener as (value: unknown) => void;
    bucket.add(wrapped);
    return {
      dispose: (): void => {
        const b = this.subscribers.get(key);
        if (b !== undefined) b.delete(wrapped);
      },
    };
  }

  private notify(key: string, value: unknown): void {
    const bucket = this.subscribers.get(key);
    if (bucket === undefined) return;
    for (const handler of bucket) {
      try {
        handler(value);
      } catch (err) {
        console.error('[runtime-composer/UserPreferences] subscriber threw:', err);
      }
    }
  }
}
