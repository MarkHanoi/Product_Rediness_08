// The browser half of BYOM (C103 §4.1). Everything else is pure and lives in
// `@pryzm/ai-host` — this file exists ONLY to bind the injected `ByomStorage`
// port to real browser storage, so the vault core has no DOM dependency and
// tests drive it with a plain Map.
//
// ⛔ THIS FILE IS THE ONLY PLACE A PROVIDER KEY IS WRITTEN TO DISK. There is no
// server row, no project field, no Yjs map, no telemetry attribute. That is not
// an implementation detail — it IS the promise the UI makes, and C103 §4.4 plus
// `byomSecretContainment.test.ts` are what keep it true.
//
// WHY BOTH AREAS. `sessionStorage` dies with the tab and is the right answer on
// a shared or borrowed machine; `localStorage` survives a restart and is the
// right answer on a personal one. Only the user knows which machine they are
// on, so only the user can pick — see C103 §4.2 for the threat model each side
// of that choice buys.
//
// SIGN-OUT IS INHERITED, NOT REIMPLEMENTED. Keys live under the `pryzm-`
// prefix, and `purgeUserScopedClientState()` in `../../platform/AuthModal.ts`
// already removes every `pryzm-`-prefixed localStorage entry and clears
// sessionStorage wholesale — on sign-out AND on account switch. A second purge
// path here would be one more thing to drift.

import { ByomVault, ByomVaultSet, type ByomStorage } from '@pryzm/ai-host';

/**
 * Wrap a `Storage` in the port shape.
 *
 * Every method may throw — Safari private mode and "block all cookies" both
 * throw on the FIRST access, not on write. The vault treats a throw as "no
 * credentials", so BYOM degrades to PRYZM's default rather than breaking the
 * chat, which is the correct failure direction.
 */
function wrap(area: () => Storage | null): ByomStorage {
  return {
    get(key) {
      return area()?.getItem(key) ?? null;
    },
    set(key, value) {
      const s = area();
      if (!s) throw new Error('storage unavailable');
      s.setItem(key, value);
    },
    remove(key) {
      area()?.removeItem(key);
    },
    keys() {
      const s = area();
      if (!s) return [];
      const out: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    },
  };
}

/** `null` rather than a throw when the global is absent (SSR, a worker, a test
 *  running in node). The caller already treats null as "no credentials". */
function safeLocal(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

let cached: ByomVaultSet | null = null;

/**
 * The editor's BYOM vaults.
 *
 * ⚠ Memoised, but the vaults hold NO state of their own — every read goes
 * straight to the live storage area. So a key written in another tab, or wiped
 * by `purgeUserScopedClientState`, is visible on the very next call without any
 * invalidation step. A cached *value* here would be a stale-credential bug; a
 * cached *accessor* cannot be.
 */
export function byomVaults(): ByomVaultSet {
  if (!cached) {
    cached = new ByomVaultSet(
      new ByomVault(wrap(safeSession), 'session'),
      new ByomVault(wrap(safeLocal), 'device'),
    );
  }
  return cached;
}

/** Test seam — drops the memoised accessor so a suite can swap the globals. */
export function __resetByomVaultsForTest(): void {
  cached = null;
}
