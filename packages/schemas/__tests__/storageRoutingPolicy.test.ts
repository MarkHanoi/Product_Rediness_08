// A.30.b — StorageRoutingPolicy schema tests.
//
// Pins the C22 §2.2 + §1.3 invariants: required eu/us/ap endpoints with an
// optional selfHosted, fixed at-rest/in-transit ciphers, positive retention
// ceiling, and the downcast rules (no self-target, unique targets).

import { describe, expect, it } from 'vitest';
import {
    StorageRoutingPolicySchema,
    StorageEndpointSchema,
    StorageEndpointsSchema,
    StorageEncryptionSchema,
    KeyModeSchema,
    AllowedDowncastSchema,
} from '../src/privacy/StorageRoutingPolicy.js';

const endpoint = (b: string, d: string) => ({ bucket: b, db: d });

function base(overrides: Record<string, unknown> = {}): unknown {
    return {
        tier: 'pii',
        endpoints: {
            eu: endpoint('pryzm-pii-eu', 'pii_eu'),
            us: endpoint('pryzm-pii-us', 'pii_us'),
            ap: endpoint('pryzm-pii-ap', 'pii_ap'),
        },
        encryption: {
            atRest: 'aes-256-gcm',
            inTransit: 'tls-1.3-min',
            keyMode: 'either',
        },
        maxRetentionDays: 365,
        allowedDowncasts: [{ to: 'derived', transformId: 'anonymise-v1' }],
        ...overrides,
    };
}

describe('Sub-schemas', () => {
    it('StorageEndpointSchema requires a non-empty bucket + db', () => {
        expect(() => StorageEndpointSchema.parse(endpoint('b', 'd'))).not.toThrow();
        expect(() => StorageEndpointSchema.parse({ bucket: '', db: 'd' })).toThrow();
        expect(() => StorageEndpointSchema.parse({ bucket: 'b', db: '' })).toThrow();
    });

    it('KeyModeSchema covers platform / byok / either', () => {
        expect(KeyModeSchema.options).toEqual(['platform', 'byok', 'either']);
    });

    it('StorageEndpointsSchema requires eu/us/ap and allows optional selfHosted', () => {
        const three = {
            eu: endpoint('e', 'e'),
            us: endpoint('u', 'u'),
            ap: endpoint('a', 'a'),
        };
        expect(() => StorageEndpointsSchema.parse(three)).not.toThrow();
        expect(() =>
            StorageEndpointsSchema.parse({ ...three, selfHosted: endpoint('s', 's') }),
        ).not.toThrow();
        // missing a managed region
        const { ap: _ap, ...twoOnly } = three;
        expect(() => StorageEndpointsSchema.parse(twoOnly)).toThrow();
    });

    it('StorageEncryptionSchema fixes the at-rest + in-transit ciphers', () => {
        expect(() =>
            StorageEncryptionSchema.parse({
                atRest: 'aes-256-gcm',
                inTransit: 'tls-1.3-min',
                keyMode: 'platform',
            }),
        ).not.toThrow();
        // a routing policy may not weaken the ciphers
        expect(() =>
            StorageEncryptionSchema.parse({
                atRest: 'aes-128-cbc',
                inTransit: 'tls-1.3-min',
                keyMode: 'platform',
            }),
        ).toThrow();
        expect(() =>
            StorageEncryptionSchema.parse({
                atRest: 'aes-256-gcm',
                inTransit: 'tls-1.2',
                keyMode: 'platform',
            }),
        ).toThrow();
    });

    it('AllowedDowncastSchema requires a tier target + non-empty transformId', () => {
        expect(() =>
            AllowedDowncastSchema.parse({ to: 'derived', transformId: 't' }),
        ).not.toThrow();
        expect(() =>
            AllowedDowncastSchema.parse({ to: 'derived', transformId: '' }),
        ).toThrow();
        expect(() =>
            AllowedDowncastSchema.parse({ to: 'public', transformId: 't' }),
        ).toThrow();
    });
});

describe('StorageRoutingPolicySchema — happy path', () => {
    it('accepts a PII policy with the anonymise downcast', () => {
        expect(() => StorageRoutingPolicySchema.parse(base())).not.toThrow();
    });

    it('accepts a telemetry policy with no downcasts + a self-hosted endpoint', () => {
        const ok = base({
            tier: 'telemetry',
            allowedDowncasts: [],
            endpoints: {
                eu: endpoint('t-eu', 't_eu'),
                us: endpoint('t-us', 't_us'),
                ap: endpoint('t-ap', 't_ap'),
                selfHosted: endpoint('t-self', 't_self'),
            },
            encryption: { atRest: 'aes-256-gcm', inTransit: 'tls-1.3-min', keyMode: 'platform' },
        });
        expect(() => StorageRoutingPolicySchema.parse(ok)).not.toThrow();
    });
});

describe('StorageRoutingPolicySchema — invariants', () => {
    it('rejects maxRetentionDays of 0 or negative', () => {
        expect(() => StorageRoutingPolicySchema.parse(base({ maxRetentionDays: 0 }))).toThrow();
        expect(() => StorageRoutingPolicySchema.parse(base({ maxRetentionDays: -1 }))).toThrow();
    });

    it('rejects a non-integer retention ceiling', () => {
        expect(() => StorageRoutingPolicySchema.parse(base({ maxRetentionDays: 30.5 }))).toThrow();
    });

    it('rejects a downcast that targets its own tier', () => {
        const bad = base({ tier: 'project', allowedDowncasts: [{ to: 'project', transformId: 'noop' }] });
        expect(() => StorageRoutingPolicySchema.parse(bad)).toThrow(/own tier/);
    });

    it('rejects duplicate downcast target tiers', () => {
        const bad = base({
            allowedDowncasts: [
                { to: 'derived', transformId: 'anonymise-v1' },
                { to: 'derived', transformId: 'anonymise-v2' },
            ],
        });
        expect(() => StorageRoutingPolicySchema.parse(bad)).toThrow(/duplicate downcast/);
    });

    it('rejects an unknown tier', () => {
        expect(() => StorageRoutingPolicySchema.parse(base({ tier: 'secret' }))).toThrow();
    });
});
