import { describe, it, expect } from 'vitest';
import {
  generatePkcePair,
  deriveChallenge,
  verifyChallenge,
  base64UrlEncode,
  randomBytes,
  sha256,
  constantTimeEquals,
  exchangeCodeForToken,
  refreshAccessToken,
} from '../src/index';

describe('base64UrlEncode (RFC 4648 §5 no-padding)', () => {
  it('encodes the empty array to the empty string', () => {
    expect(base64UrlEncode(new Uint8Array())).toBe('');
  });

  it('uses - and _ instead of + and /', () => {
    // Bytes 0xfb, 0xff produce + and / in standard base64; check the alphabet swap.
    const out = base64UrlEncode(new Uint8Array([0xfb, 0xff]));
    expect(out).not.toContain('+');
    expect(out).not.toContain('/');
    expect(out).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('strips trailing = padding', () => {
    expect(base64UrlEncode(new Uint8Array([0x66]))).not.toContain('=');
  });

  it('round-trips the canonical RFC 4648 §10 test vector "foobar"', () => {
    expect(base64UrlEncode(new TextEncoder().encode('foobar'))).toBe('Zm9vYmFy');
  });
});

describe('randomBytes', () => {
  it('returns the requested length', async () => {
    const out = await randomBytes(32);
    expect(out.length).toBe(32);
  });

  it('rejects out-of-range lengths', async () => {
    await expect(randomBytes(0)).rejects.toBeInstanceOf(RangeError);
    await expect(randomBytes(1025)).rejects.toBeInstanceOf(RangeError);
    await expect(randomBytes(1.5)).rejects.toBeInstanceOf(RangeError);
  });

  it('produces distinct outputs across calls (entropy smoke test)', async () => {
    const a = await randomBytes(32);
    const b = await randomBytes(32);
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
  });
});

describe('sha256', () => {
  it('matches the RFC test vector for the empty string', async () => {
    const out = await sha256(new Uint8Array());
    expect(Buffer.from(out).toString('hex')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('matches the RFC test vector for "abc"', async () => {
    const out = await sha256(new TextEncoder().encode('abc'));
    expect(Buffer.from(out).toString('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('generatePkcePair (RFC 7636 §4.1 + §4.2)', () => {
  it('produces a 43-char base64url verifier (32 bytes of entropy)', async () => {
    const pair = await generatePkcePair();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9\-._~]{43}$/);
  });

  it('uses S256 method (never plain — RFC 7636 §7.2 + OAuth 2.1)', async () => {
    const pair = await generatePkcePair();
    expect(pair.method).toBe('S256');
  });

  it('challenge is base64url(SHA-256(verifier))', async () => {
    const pair = await generatePkcePair();
    const expected = await deriveChallenge(pair.verifier);
    expect(pair.challenge).toBe(expected);
  });

  it('two calls produce different verifiers (entropy)', async () => {
    const a = await generatePkcePair();
    const b = await generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });

  it('returned object is frozen (immutable contract)', async () => {
    const pair = await generatePkcePair();
    expect(Object.isFrozen(pair)).toBe(true);
  });
});

describe('deriveChallenge (RFC 7636 Appendix B test vector)', () => {
  it('matches the RFC 7636 Appendix B vector', async () => {
    // RFC 7636 Appendix B: code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // → code_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await deriveChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('rejects a verifier that violates the alphabet', async () => {
    await expect(deriveChallenge('contains spaces and short')).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects a verifier shorter than 43 chars', async () => {
    await expect(deriveChallenge('a'.repeat(42))).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects a verifier longer than 128 chars', async () => {
    await expect(deriveChallenge('a'.repeat(129))).rejects.toBeInstanceOf(TypeError);
  });
});

describe('verifyChallenge', () => {
  it('returns true for a freshly generated pair', async () => {
    const { verifier, challenge } = await generatePkcePair();
    expect(await verifyChallenge(verifier, challenge)).toBe(true);
  });

  it('returns false for the wrong challenge', async () => {
    const { verifier } = await generatePkcePair();
    const other = await generatePkcePair();
    expect(await verifyChallenge(verifier, other.challenge)).toBe(false);
  });

  it('returns false (does not throw) for a malformed verifier', async () => {
    expect(await verifyChallenge('garbage with spaces', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(false);
  });

  it('returns false (does not throw) for a malformed challenge', async () => {
    const { verifier } = await generatePkcePair();
    expect(await verifyChallenge(verifier, 'too-short')).toBe(false);
  });

  it('matches the RFC 7636 Appendix B vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(await verifyChallenge(verifier, challenge)).toBe(true);
  });
});

describe('constantTimeEquals', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('', '')).toBe(true);
  });

  it('returns false for different lengths (early-out is OK)', () => {
    expect(constantTimeEquals('a', 'ab')).toBe(false);
  });

  it('returns false for same-length unequal strings', () => {
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('xyz', 'abc')).toBe(false);
  });
});

describe('exchangeCodeForToken (RFC 6749 §4.1.3 + RFC 7636 §4.5)', () => {
  it('happy path — sends grant_type=authorization_code with verifier', async () => {
    let captured: { url?: string; body?: string; method?: string } = {};
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), body: String(init?.body ?? ''), method: String(init?.method ?? '') };
      return new Response(JSON.stringify({ access_token: 't', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await exchangeCodeForToken({
      tokenEndpoint: 'https://auth.pryzm.com/oauth/token',
      code: 'AUTHCODE',
      verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      redirectUri: 'https://app.example.com/cb',
      clientId: 'CLI_X',
      fetchImpl: fakeFetch,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.access_token).toBe('t');
    expect(captured.method).toBe('POST');
    expect(captured.url).toBe('https://auth.pryzm.com/oauth/token');
    const params = new URLSearchParams(captured.body!);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('AUTHCODE');
    expect(params.get('code_verifier')).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(params.get('redirect_uri')).toBe('https://app.example.com/cb');
    expect(params.get('client_id')).toBe('CLI_X');
  });

  it('error path — surfaces the OAuth error envelope', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'code expired' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const result = await exchangeCodeForToken({
      tokenEndpoint: 'https://auth.pryzm.com/oauth/token',
      code: 'EXPIRED',
      verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      redirectUri: 'https://app.example.com/cb',
      clientId: 'CLI_X',
      fetchImpl: fakeFetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error.error).toBe('invalid_grant');
      expect(result.error.error_description).toBe('code expired');
    }
  });

  it('non-JSON response — wraps as invalid_response', async () => {
    const fakeFetch = (async () =>
      new Response('not json', { status: 502, headers: { 'content-type': 'text/plain' } })) as typeof fetch;
    const result = await exchangeCodeForToken({
      tokenEndpoint: 'https://auth.pryzm.com/oauth/token',
      code: 'X',
      verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      redirectUri: 'https://app.example.com/cb',
      clientId: 'CLI_X',
      fetchImpl: fakeFetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error).toBe('invalid_response');
  });
});

describe('refreshAccessToken (RFC 6749 §6)', () => {
  it('sends grant_type=refresh_token with the refresh token + client_id', async () => {
    let body = '';
    const fakeFetch = (async (_url: string | URL, init?: RequestInit) => {
      body = String(init?.body ?? '');
      return new Response(JSON.stringify({ access_token: 't2', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await refreshAccessToken({
      tokenEndpoint: 'https://auth.pryzm.com/oauth/token',
      refreshToken: 'OLD',
      clientId: 'CLI_X',
      fetchImpl: fakeFetch,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.access_token).toBe('t2');
      expect(result.response.refresh_token).toBe('r2');
    }
    const params = new URLSearchParams(body);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('OLD');
    expect(params.get('client_id')).toBe('CLI_X');
  });
});
