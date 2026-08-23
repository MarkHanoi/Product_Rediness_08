// C103 §4 + §6.1 — the device vault and the route decision.
//
// ⭐ THE LOAD-BEARING TEST IN THIS FILE is `§DEFAULT-UNCHANGED`. The founder's
// instruction was "we have a default algorithm for the RAC and I want to keep
// it that way", and the brief required that be PROVEN rather than asserted by
// inspection. A user with no key configured must resolve to `pryzm-managed`
// with quota ON and spend ON — i.e. bit-for-bit today's behaviour.

import { describe, it, expect } from 'vitest';
import {
  BYOM_STORAGE_PREFIX,
  ByomVault,
  ByomVaultSet,
  findProvider,
  resolveAiRoute,
  routeAttributionLine,
  routeProvenanceFields,
  type ByomStorage,
} from '../src/byom/index.js';

/** A plain Map standing in for localStorage/sessionStorage. */
function memStorage(): ByomStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    get: (k) => raw.get(k) ?? null,
    set: (k, v) => void raw.set(k, v),
    remove: (k) => void raw.delete(k),
    keys: () => [...raw.keys()],
  };
}

/** A storage that throws on every access — private mode, site data blocked. */
const hostileStorage: ByomStorage = {
  get() { throw new Error('storage blocked'); },
  set() { throw new Error('storage blocked'); },
  remove() { throw new Error('storage blocked'); },
  keys() { throw new Error('storage blocked'); },
};

const ANTHROPIC = findProvider('anthropic')!;
const OLLAMA = findProvider('ollama')!;
const SECRET = 'sk-ant-api03-ZZZTESTKEYTESTKEYTESTKEYTESTKEY1234';

function newSet() {
  const s = memStorage();
  const d = memStorage();
  return {
    session: s,
    device: d,
    set: new ByomVaultSet(new ByomVault(s, 'session'), new ByomVault(d, 'device')),
  };
}

describe('§PURGE-PREFIX — keys inherit the sign-out purge', () => {
  it('stores under a pryzm- prefix so purgeUserScopedClientState() removes them', () => {
    // ⛔ If this ever fails, BYOM keys have silently LEFT the sign-out purge in
    // AuthModal.ts (which removes every `pryzm-`-prefixed localStorage entry).
    // That would be a security regression with no visible symptom, which is
    // exactly why it is pinned here rather than left to a comment.
    expect(BYOM_STORAGE_PREFIX.startsWith('pryzm-')).toBe(true);

    const { device, set } = newSet();
    set.device.save(ANTHROPIC, { secret: SECRET });
    set.device.setActiveProvider('anthropic');
    const stored = [...device.raw.keys()];
    expect(stored.length).toBeGreaterThan(0);
    for (const k of stored) expect(k.startsWith('pryzm-')).toBe(true);
  });
});

describe('§VAULT — save / describe / resolve', () => {
  it('rejects an empty key for a provider that needs one, and stores nothing', () => {
    const { device, set } = newSet();
    const r = set.device.save(ANTHROPIC, { secret: '   ' });
    expect(r.ok).toBe(false);
    // A saved-but-empty key would produce a 401 the user reads as "my key is
    // wrong" when in fact nothing was ever stored. Nothing is stored.
    expect(device.raw.size).toBe(0);
  });

  it('accepts a keyless save for Ollama — absent and inapplicable are different values', () => {
    const { set } = newSet();
    expect(set.device.save(OLLAMA, { secret: '' }).ok).toBe(true);
    expect(set.device.describe('ollama')?.maskedKey).toBe('(none)');
    expect(set.device.resolve('ollama')).not.toBeNull();
  });

  it('describe() never returns the secret, in any field', () => {
    const { set } = newSet();
    set.device.save(ANTHROPIC, { secret: SECRET });
    const d = set.device.describe('anthropic')!;
    expect(JSON.stringify(d)).not.toContain(SECRET);
    // Masking shows the TAIL, never the vendor prefix — a prefix identifies the
    // vendor and narrows a brute force.
    expect(d.maskedKey).not.toContain('sk-ant');
    expect(d.maskedKey).toContain('1234');
  });

  it('resolve() is the only thing that yields the secret', () => {
    const { set } = newSet();
    set.device.save(ANTHROPIC, { secret: SECRET });
    expect(set.device.resolve('anthropic')!.secret).toBe(SECRET);
  });

  it('a corrupt stored entry degrades to unconfigured rather than crashing', () => {
    const { device, set } = newSet();
    device.raw.set(`${BYOM_STORAGE_PREFIX}p-anthropic`, '{not json');
    expect(set.device.describe('anthropic')).toBeNull();
    expect(() => set.device.configuredProviders()).not.toThrow();
  });

  it('clearing the active provider also clears the selection', () => {
    const { set } = newSet();
    set.device.save(ANTHROPIC, { secret: SECRET });
    set.device.setActiveProvider('anthropic');
    set.device.clear('anthropic');
    expect(set.device.activeProviderId()).toBeNull();
  });

  it('session wins over device when both hold a selection', () => {
    const { set } = newSet();
    set.device.save(ANTHROPIC, { secret: SECRET });
    set.device.setActiveProvider('anthropic');
    set.session.save(OLLAMA, { secret: '' });
    set.session.setActiveProvider('ollama');
    expect(set.activeProviderId()).toBe('ollama');
  });
});

describe('§DEFAULT-UNCHANGED — a user with no key gets exactly today behaviour', () => {
  it('no vault at all resolves to PRYZM, with quota ON and spend ON', () => {
    const r = resolveAiRoute(null);
    expect(r.keyClass).toBe('pryzm-managed');
    expect(r.quotaApplies).toBe(true);
    expect(r.billsToPryzm).toBe(true);
    expect(r.providerId).toBeNull();
  });

  it('an empty vault resolves to PRYZM, with quota ON and spend ON', () => {
    const { set } = newSet();
    const r = resolveAiRoute(set);
    expect(r.keyClass).toBe('pryzm-managed');
    expect(r.reason).toBe('no-provider-selected');
    expect(r.quotaApplies).toBe(true);
    expect(r.billsToPryzm).toBe(true);
  });

  it('a key SAVED but NOT selected still resolves to PRYZM — storing is not enabling', () => {
    const { set } = newSet();
    set.device.save(ANTHROPIC, { secret: SECRET });
    const r = resolveAiRoute(set);
    expect(r.keyClass).toBe('pryzm-managed');
    expect(r.reason).toBe('no-provider-selected');
  });

  it('unreadable storage resolves to PRYZM rather than failing the request', () => {
    const set = new ByomVaultSet(
      new ByomVault(hostileStorage, 'session'),
      new ByomVault(hostileStorage, 'device'),
    );
    const r = resolveAiRoute(set);
    expect(r.keyClass).toBe('pryzm-managed');
    expect(r.quotaApplies).toBe(true);
  });
});

describe('§ROUTE — a selected provider inverts payer, quota and spend', () => {
  it('quota does NOT apply and spend does NOT bill to PRYZM', () => {
    const { set } = newSet();
    set.device.save(ANTHROPIC, { secret: SECRET });
    set.device.setActiveProvider('anthropic');
    const r = resolveAiRoute(set);
    expect(r.keyClass).toBe('user-supplied');
    expect(r.reason).toBe('user-provider-active');
    expect(r.providerId).toBe('anthropic');
    // Metering someone else's spend against your quota is wrong. C103 §5.1.
    expect(r.quotaApplies).toBe(false);
    expect(r.billsToPryzm).toBe(false);
  });

  it('the privacy statement DIFFERS between the two paths — C22 needs two tiers, not one', () => {
    const { set } = newSet();
    const pryzm = resolveAiRoute(set).privacyStatement;
    set.device.save(ANTHROPIC, { secret: SECRET });
    set.device.setActiveProvider('anthropic');
    const byom = resolveAiRoute(set).privacyStatement;
    expect(byom).not.toBe(pryzm);
    expect(pryzm).toContain('PRYZM');
    expect(byom).toContain('does not pass');
  });

  it('a fully-local provider says the prompt does not leave the machine', () => {
    const { set } = newSet();
    set.device.save(OLLAMA, { secret: '' });
    set.device.setActiveProvider('ollama');
    expect(resolveAiRoute(set).privacyStatement).toContain('does not leave your computer');
  });

  it('a SELECTED but UNRESOLVABLE provider is its own reason, not silence', () => {
    const { device, set } = newSet();
    // Selected, but the credential entry was never written (or was wiped).
    device.raw.set(`${BYOM_STORAGE_PREFIX}active`, 'anthropic');
    const r = resolveAiRoute(set);
    expect(r.keyClass).toBe('pryzm-managed');
    expect(r.reason).toBe('user-provider-unresolvable');
    // …and the user is TOLD, rather than quietly served by PRYZM.
    expect(routeAttributionLine(r)).toContain('no usable key stored');
  });
});

describe('§C23-PROVENANCE — the audit fragment records the key CLASS, never the key', () => {
  it('carries key class, provider, quota and billing flags', () => {
    const { set } = newSet();
    set.device.save(ANTHROPIC, { secret: SECRET });
    set.device.setActiveProvider('anthropic');
    const fields = routeProvenanceFields(resolveAiRoute(set));
    expect(fields['ai.key.class']).toBe('user-supplied');
    expect(fields['ai.key.provider']).toBe('anthropic');
    expect(fields['ai.quota.applies']).toBe(false);
    expect(fields['ai.spend.bills_to_pryzm']).toBe(false);
    expect(JSON.stringify(fields)).not.toContain(SECRET);
  });

  it('the default path is recorded as pryzm, not as an absence', () => {
    const fields = routeProvenanceFields(resolveAiRoute(null));
    expect(fields['ai.key.class']).toBe('pryzm-managed');
    expect(fields['ai.key.provider']).toBe('pryzm');
  });

  it('the attribution line names which path answered, on both arms', () => {
    const { set } = newSet();
    expect(routeAttributionLine(resolveAiRoute(set))).toContain("PRYZM's built-in AI");
    set.device.save(ANTHROPIC, { secret: SECRET });
    set.device.setActiveProvider('anthropic');
    const line = routeAttributionLine(resolveAiRoute(set));
    expect(line).toContain('your own Claude key');
    expect(line).toContain("did not use PRYZM's AI quota");
  });
});
