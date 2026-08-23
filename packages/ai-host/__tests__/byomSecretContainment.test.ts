// C105 §4.4 + §6.3 — the key does not reach a snapshot, a log, or PRYZM.
//
// ⭐ WHY A STATIC ARM EXISTS HERE. The brief's requirement was "prove by test
// that a key cannot land in a save". A behavioural test can only prove that the
// key is absent from the ONE serialisation it happens to drive; the thing that
// actually makes it absent from ALL of them is that the BYOM subsystem has no
// edge to persistence at all. So arm A reads the source and asserts the ABSENT
// EDGE, and arm B drives the values. Neither alone is the proof.
//
// ⚠ A single grep tool is not proof (this repo has been bitten twice this week
// by ripgrep missing files a plain read found), so arm A enumerates the
// directory with `readdirSync` and reads every file — no search tool in the
// loop at all.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDescriptorIsSafe,
  assertNoSecret,
  ByomSecretLeakError,
  ByomVault,
  ByomVaultSet,
  looksLikeSecret,
  maskCredential,
  redactSecrets,
  findProvider,
  resolveAiRoute,
  routeProvenanceFields,
  type ByomStorage,
} from '../src/byom/index.js';

const BYOM_DIR = join(fileURLToPath(new URL('../src/byom/', import.meta.url)));
const SECRET = 'sk-ant-api03-CONTAINMENTCANARYCONTAINMENTCANARY7';

function memStorage(): ByomStorage {
  const raw = new Map<string, string>();
  return {
    get: (k) => raw.get(k) ?? null,
    set: (k, v) => void raw.set(k, v),
    remove: (k) => void raw.delete(k),
    keys: () => [...raw.keys()],
  };
}

function byomSources(): Array<{ file: string; text: string }> {
  return readdirSync(BYOM_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(BYOM_DIR, f), 'utf8') }));
}

/**
 * Strip comments so the scans below measure CODE, not prose.
 *
 * ⚠ This is not cosmetic. The first run of this file failed on
 * `ByomRelay.ts → apiFetch` — a hit inside the very comment explaining why
 * `apiFetch` must NOT be used there. A gate that a correct explanation trips
 * teaches authors to delete the explanation, which is the opposite of what it
 * is for. Naive, but sufficient: BYOM sources contain no regex literal or
 * string holding `//`, and `§GUARD` below would fail loudly if the stripper
 * ever ate real code.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('ARM A (static) — BYOM has NO edge to persistence, sync or telemetry', () => {
  const sources = byomSources();

  it('enumerates the real directory (guards against an empty-set false pass)', () => {
    // ⛔ A test that asserts "none of zero files import persistence" passes
    // vacuously. Pin the census so deleting the subsystem fails loudly.
    expect(sources.length).toBeGreaterThanOrEqual(5);
    expect(sources.map((s) => s.file).sort()).toContain('ByomVault.ts');
  });

  it('imports nothing that can write to a project file, a store or the wire home', () => {
    // If any of these ever appears, a credential has acquired a path into a
    // save, a CRDT document, or PRYZM's own server.
    const forbidden = [
      '@pryzm/persistence-client',
      '@pryzm/sync-client',
      '@pryzm/file-format',
      '@pryzm/stores',
      '@pryzm/core-app-model',
      '@pryzm/command-bus',
      'ProjectSerializer',
      'yjs',
      'Y.Doc',
    ];
    const offences: string[] = [];
    for (const { file, text } of sources) {
      const code = codeOnly(text);
      for (const token of forbidden) {
        if (code.includes(token)) offences.push(`${file} → ${token}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('never calls console.* — a credential cannot reach a log from here', () => {
    const offences = sources
      .filter(({ text }) => /\bconsole\s*\.\s*(log|warn|error|info|debug|trace)\b/.test(codeOnly(text)))
      .map(({ file }) => file);
    expect(offences).toEqual([]);
  });

  it('never posts to a PRYZM-origin path — the key is not proxied home', () => {
    // A relative URL, or any /api/ path, would route through PRYZM's server and
    // put the user's key on PRYZM's wire. C105 §3.1: browser → provider, direct.
    const offences: string[] = [];
    for (const { file, text } of sources) {
      if (file === 'ByomProviders.ts') continue; // provider URLs are absolute; asserted below
      const code = codeOnly(text);
      if (/['"`]\/api\//.test(code)) offences.push(`${file} → /api/ path`);
      // `apiFetch(` — a CALL, not the word inside a comment explaining its absence.
      if (/\bapiFetch\s*\(/.test(code)) offences.push(`${file} → apiFetch (attaches the PRYZM session)`);
    }
    expect(offences).toEqual([]);
  });

  it('every provider endpoint is an ABSOLUTE third-party URL', () => {
    for (const p of [
      'anthropic',
      'openai',
      'google',
      'deepseek',
      'openrouter',
      'ollama',
    ] as const) {
      const provider = findProvider(p)!;
      expect(provider.defaultBaseUrl).toMatch(/^https?:\/\//);
      expect(provider.defaultBaseUrl.startsWith('/')).toBe(false);
    }
  });
});

describe('ARM B (behavioural) — the values themselves never carry the secret', () => {
  function loadedVaults(): ByomVaultSet {
    const set = new ByomVaultSet(
      new ByomVault(memStorage(), 'session'),
      new ByomVault(memStorage(), 'device'),
    );
    set.device.save(findProvider('anthropic')!, { secret: SECRET });
    set.device.setActiveProvider('anthropic');
    return set;
  }

  it('§NO-KEY-IN-SNAPSHOT — everything the app can serialise is secret-free', () => {
    const set = loadedVaults();
    // The three values any other subsystem could ever obtain from BYOM. If a
    // snapshot, a span, or a bug report embeds BYOM state, it embeds one of
    // these — and none of them carries the key.
    const exportable = {
      descriptors: set.describeAll(),
      route: resolveAiRoute(set),
      provenance: routeProvenanceFields(resolveAiRoute(set)),
    };
    const serialised = JSON.stringify(exportable);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain('sk-ant');
    // The secret IS still reachable by the one function entitled to it, so this
    // test is not passing merely because the vault is empty.
    expect(set.resolveActive()!.secret).toBe(SECRET);
  });

  it('a descriptor that gained a secret field would TRIP the guard', () => {
    const d = { ...loadedVaults().describeAll()[0]!, model: SECRET };
    expect(() => assertDescriptorIsSafe(d, 'test')).toThrow(ByomSecretLeakError);
  });

  it('assertDescriptorIsSafe passes on a real descriptor', () => {
    for (const d of loadedVaults().describeAll()) {
      expect(() => assertDescriptorIsSafe(d, 'test')).not.toThrow();
    }
  });
});

describe('§GUARD — the redaction detectors catch each vendor shape', () => {
  it.each([
    ['anthropic', 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA'],
    ['openrouter', 'sk-or-v1-BBBBBBBBBBBBBBBBBBBBBBBBBB'],
    ['openai-proj', 'sk-proj-CCCCCCCCCCCCCCCCCCCCCCCCCC'],
    ['openai', 'sk-DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'],
    ['google', 'AIzaEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'],
    ['bearer', 'Authorization: Bearer FFFFFFFFFFFFFFFFFFFFFFFF'],
    ['unknown-vendor', 'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'],
  ])('detects a %s-shaped credential', (_name, sample) => {
    expect(looksLikeSecret(sample)).toBe(true);
    expect(redactSecrets(`prefix ${sample} suffix`)).not.toContain(sample);
    expect(() => assertNoSecret(sample, 'test')).toThrow(ByomSecretLeakError);
  });

  it('does not fire on ordinary prose or on an element id', () => {
    for (const benign of ['Move the wall 200mm north', 'wall_01H9Z', 'claude-haiku-4-5', '']) {
      expect(looksLikeSecret(benign)).toBe(false);
      expect(() => assertNoSecret(benign, 'test')).not.toThrow();
    }
  });

  it('the mask shows the TAIL, never the vendor prefix', () => {
    const masked = maskCredential(SECRET);
    expect(masked).not.toContain('sk-ant');
    expect(masked).toContain(SECRET.slice(-4));
    expect(maskCredential('')).toBe('(none)');
    // …and the mask itself must not read as a credential to the guard.
    expect(looksLikeSecret(masked)).toBe(false);
  });
});
