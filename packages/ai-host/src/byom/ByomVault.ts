// @pryzm/ai-host — BYOM device vault (C103 §4, SPEC-BYOM-PROVIDER-KEYS §4).
//
// WHERE THE KEY LIVES, AND WHY. The founder's promise is the feature:
// "stored only on this device, and it leaves it only to call the provider you
// choose." So the vault is a browser storage area on the user's own machine and
// nothing else. There is no server row, no project field, no Yjs map, no
// telemetry attribute. C103 §4.2 carries the full threat model; the short form:
//
//   • localStorage is readable by ANY script on this origin. That is a real
//     risk and it is NOT hidden — it is stated in the UI in the same plain
//     words as the promise, because a promise the user cannot evaluate is
//     worse than no promise.
//   • The user picks the storage area. `session` (sessionStorage) dies with the
//     tab and is the right answer on a shared or borrowed machine. `device`
//     (localStorage) survives a restart and is the right answer on a personal
//     one. Both are device-local; neither is synced.
//   • Sign-out purges both. Not by new code: keys are stored under the
//     `pryzm-` prefix, and `purgeUserScopedClientState()` in AuthModal.ts
//     already removes every `pryzm-`-prefixed localStorage entry and clears
//     sessionStorage wholesale, on sign-out AND on account switch. Inheriting
//     a tested invariant beats minting a second one that can drift.
//
// LAYER. This file is PURE: it takes an injected `ByomStorage` port, so the
// core has no DOM dependency and the tests drive a plain Map. The browser
// adapter lives in the editor (`apps/editor/src/ui/ai/byom/byomDeviceStorage.ts`).

import { findProvider, type ByomProvider, type ByomProviderId } from './ByomProviders.js';
import { assertNoSecret, maskCredential } from './ByomRedaction.js';

/** Storage areas the user may choose. See the header for the trade-off. */
export type ByomStorageArea = 'device' | 'session';

/**
 * The injected storage port. Three methods, all synchronous, all allowed to
 * throw — a browser in private mode or with site data blocked throws on the
 * very first access, and the vault treats that as "no credentials", never as a
 * crash.
 */
export interface ByomStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  /** Every key currently held, so the vault can enumerate without a manifest. */
  keys(): readonly string[];
}

/** The stored, non-secret half of a configuration. Safe to log and render. */
export interface ByomCredentialDescriptor {
  readonly providerId: ByomProviderId;
  readonly area: ByomStorageArea;
  /** User-chosen model id, or the provider default when unset. */
  readonly model: string;
  /** Resolved endpoint — the provider default unless the user overrode it. */
  readonly baseUrl: string;
  /** `••••abcd (108 chars)`, or `(none)` for a keyless provider. NEVER the key. */
  readonly maskedKey: string;
  /** True when this provider is the one the chat should use. */
  readonly enabled: boolean;
}

/** A descriptor plus the live secret. ⛔ Never log, never serialise, never
 *  return from anything that crosses a network or a store boundary. Held only
 *  between `resolve()` and the fetch inside `ByomRelay`. */
export interface ByomCredential extends ByomCredentialDescriptor {
  readonly secret: string;
}

/** ⚠ MUST stay `pryzm-`-prefixed — see the header. Changing this prefix silently
 *  removes BYOM keys from the sign-out purge, which would be a security
 *  regression with no visible symptom. `ByomVault.purgePrefix.test.ts` pins it. */
export const BYOM_STORAGE_PREFIX = 'pryzm-byom-';

/** The key under which the selected provider id is stored. */
export const BYOM_ACTIVE_KEY = `${BYOM_STORAGE_PREFIX}active`;

function entryKey(id: ByomProviderId): string {
  return `${BYOM_STORAGE_PREFIX}p-${id}`;
}

interface StoredEntry {
  readonly k?: string;
  readonly m?: string;
  readonly u?: string;
}

/**
 * The vault. Construct one per storage area; `ByomVaultSet` below drives both
 * so a caller never has to remember which area a given provider was saved in.
 */
export class ByomVault {
  constructor(
    private readonly storage: ByomStorage,
    readonly area: ByomStorageArea,
  ) {}

  /** Providers with a stored entry in THIS area. */
  configuredProviders(): readonly ByomProviderId[] {
    let keys: readonly string[];
    try {
      keys = this.storage.keys();
    } catch {
      return [];
    }
    const out: ByomProviderId[] = [];
    for (const k of keys) {
      if (!k.startsWith(`${BYOM_STORAGE_PREFIX}p-`)) continue;
      const id = k.slice(`${BYOM_STORAGE_PREFIX}p-`.length);
      const provider = findProvider(id);
      if (provider) out.push(provider.id);
    }
    return out;
  }

  /** Which provider the user selected, or `null` for "use PRYZM's default". */
  activeProviderId(): ByomProviderId | null {
    let raw: string | null;
    try {
      raw = this.storage.get(BYOM_ACTIVE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    return findProvider(raw)?.id ?? null;
  }

  /** Select the provider the chat should use. `null` returns to PRYZM's key. */
  setActiveProvider(id: ByomProviderId | null): void {
    try {
      if (id === null) this.storage.remove(BYOM_ACTIVE_KEY);
      else this.storage.set(BYOM_ACTIVE_KEY, id);
    } catch {
      /* storage unavailable — the caller re-reads and sees the unchanged value */
    }
  }

  /**
   * Store a credential. `secret` may be empty ONLY for a keyless provider —
   * an empty key for an `api-key` provider is a misconfiguration and is
   * REJECTED rather than saved, because a saved-but-empty key produces a 401
   * the user will read as "my key is wrong" when in fact nothing was stored.
   */
  save(
    provider: ByomProvider,
    input: { secret: string; model?: string; baseUrl?: string },
  ): { ok: true } | { ok: false; reason: string } {
    const secret = (input.secret ?? '').trim();
    if (provider.auth === 'api-key' && !secret) {
      return { ok: false, reason: `${provider.label} needs an API key. Nothing was saved.` };
    }
    if (!provider.allowsCustomBaseUrl && input.baseUrl && input.baseUrl !== provider.defaultBaseUrl) {
      return { ok: false, reason: `${provider.label} does not accept a custom address. Nothing was saved.` };
    }
    const entry: StoredEntry = {
      ...(secret ? { k: secret } : {}),
      ...(input.model?.trim() ? { m: input.model.trim() } : {}),
      ...(input.baseUrl?.trim() ? { u: input.baseUrl.trim() } : {}),
    };
    try {
      this.storage.set(entryKey(provider.id), JSON.stringify(entry));
    } catch (err) {
      // ⛔ `err` may embed the value we just tried to write. Never forward it.
      return {
        ok: false,
        reason: 'This browser refused to store the key (private mode, or site data is blocked).',
      };
    }
    return { ok: true };
  }

  /** Forget one provider's credential. */
  clear(id: ByomProviderId): void {
    try {
      this.storage.remove(entryKey(id));
    } catch {
      /* nothing stored is the same outcome as nothing to remove */
    }
    if (this.activeProviderId() === id) this.setActiveProvider(null);
  }

  /** Forget everything BYOM in this area. Used by the UI's "remove all". */
  clearAll(): void {
    for (const id of this.configuredProviders()) this.clear(id);
    this.setActiveProvider(null);
  }

  private read(id: ByomProviderId): StoredEntry | null {
    let raw: string | null;
    try {
      raw = this.storage.get(entryKey(id));
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as StoredEntry) : null;
    } catch {
      // A corrupt entry is a FAILURE, not an absence — but there is nothing the
      // user can do with a parse error, and pretending it is a valid empty
      // credential would produce a mystery 401. Treat as unconfigured; the UI
      // shows the provider as not set up, which is the truthful rendering.
      return null;
    }
  }

  /** Non-secret view of one provider's configuration, or `null` if unset. */
  describe(id: ByomProviderId): ByomCredentialDescriptor | null {
    const provider = findProvider(id);
    if (!provider) return null;
    const entry = this.read(id);
    if (!entry) return null;
    return {
      providerId: provider.id,
      area: this.area,
      model: entry.m ?? provider.defaultModel,
      baseUrl: entry.u ?? provider.defaultBaseUrl,
      maskedKey: maskCredential(entry.k ?? ''),
      enabled: this.activeProviderId() === provider.id,
    };
  }

  /**
   * The secret-bearing resolve. ⛔ The ONLY caller that should hold this value
   * is `createByomRelay`, and it must drop it after the fetch.
   */
  resolve(id: ByomProviderId): ByomCredential | null {
    const descriptor = this.describe(id);
    if (!descriptor) return null;
    const provider = findProvider(id);
    if (!provider) return null;
    const entry = this.read(id);
    const secret = entry?.k ?? '';
    if (provider.auth === 'api-key' && !secret) return null;
    return { ...descriptor, secret };
  }
}

/**
 * Both areas at once. The chat asks this, not a single vault, so a key saved as
 * "session" is found without the caller tracking where it went. Session wins
 * over device on a tie: the more ephemeral, more deliberate choice is the one
 * the user made most recently in this tab.
 */
export class ByomVaultSet {
  constructor(
    readonly session: ByomVault,
    readonly device: ByomVault,
  ) {}

  /** Ordered most-ephemeral first. */
  vaults(): readonly ByomVault[] {
    return [this.session, this.device];
  }

  /**
   * What the user SELECTED, regardless of whether a credential for it can be
   * resolved.
   *
   * ⚠ This is deliberately a DIFFERENT method from `activeProviderId()`, and the
   * difference is load-bearing. "The user chose nothing" and "the user chose
   * Claude but the stored key is gone" are two different situations with two
   * different things to tell them, and an earlier draft of this class collapsed
   * them into one `null` — which made a vanished key indistinguishable from a
   * deliberate default. `byomVaultAndRoute.test.ts §ROUTE` caught it.
   * (§CONTEXT-DATA-HONESTY: failure and emptiness are never the same value.)
   */
  selectedProviderId(): ByomProviderId | null {
    for (const v of this.vaults()) {
      const id = v.activeProviderId();
      if (id) return id;
    }
    return null;
  }

  /** The selected provider that also RESOLVES, or `null`. */
  activeProviderId(): ByomProviderId | null {
    for (const v of this.vaults()) {
      const id = v.activeProviderId();
      if (id && v.describe(id)) return id;
    }
    return null;
  }

  /** Non-secret view of every configured provider, across both areas. */
  describeAll(): readonly ByomCredentialDescriptor[] {
    const seen = new Set<string>();
    const out: ByomCredentialDescriptor[] = [];
    for (const v of this.vaults()) {
      for (const id of v.configuredProviders()) {
        if (seen.has(id)) continue;
        const d = v.describe(id);
        if (!d) continue;
        seen.add(id);
        out.push(d);
      }
    }
    return out;
  }

  /** Resolve the ACTIVE credential, or `null` when the user has none selected. */
  resolveActive(): ByomCredential | null {
    const id = this.activeProviderId();
    if (!id) return null;
    for (const v of this.vaults()) {
      const c = v.resolve(id);
      if (c) return c;
    }
    return null;
  }
}

/**
 * Belt-and-braces: assert a descriptor really carries no secret. Called by the
 * UI before it renders and by the provenance path before it records, so a
 * future edit that widens `ByomCredentialDescriptor` to include the key trips a
 * test instead of shipping.
 */
export function assertDescriptorIsSafe(d: ByomCredentialDescriptor, where: string): void {
  for (const [field, value] of Object.entries(d)) {
    if (field === 'maskedKey') continue;
    assertNoSecret(value, `${where}.${field}`);
  }
}
