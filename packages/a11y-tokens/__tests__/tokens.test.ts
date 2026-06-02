// A.34.a — token registry + audit tests.

import { describe, expect, it } from 'vitest';
import {
    PRYZM_TOKENS,
    TOKEN_PAIRS,
    auditTokenPairs,
    type TokenPair,
} from '../src/tokens.js';

describe('PRYZM_TOKENS registry', () => {
    it('every token is a valid 6-char hex', () => {
        for (const [name, hex] of Object.entries(PRYZM_TOKENS)) {
            expect(hex, name).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });

    it('canonical PRYZM purple is #6600FF', () => {
        expect(PRYZM_TOKENS['pryzm-purple']).toBe('#6600FF');
    });

    it('every token id is kebab-case', () => {
        for (const name of Object.keys(PRYZM_TOKENS)) {
            expect(name, name).toMatch(/^[a-z][a-z0-9-]*$/);
        }
    });
});

describe('TOKEN_PAIRS registry', () => {
    it('every pair has a non-empty id + usage', () => {
        for (const pair of TOKEN_PAIRS) {
            expect(pair.id.length).toBeGreaterThan(0);
            expect(pair.usage.length).toBeGreaterThan(0);
        }
    });

    it('every pair id is unique', () => {
        const seen = new Set<string>();
        for (const pair of TOKEN_PAIRS) {
            expect(seen.has(pair.id), pair.id).toBe(false);
            seen.add(pair.id);
        }
    });

    it('every foreground + background references an existing token', () => {
        const tokens = new Set(Object.keys(PRYZM_TOKENS));
        for (const pair of TOKEN_PAIRS) {
            expect(tokens.has(pair.foreground), pair.id).toBe(true);
            expect(tokens.has(pair.background), pair.id).toBe(true);
        }
    });

    it('text-dense surfaces (inspect tree + data panel) are AAA-gated', () => {
        const dense = TOKEN_PAIRS.filter(
            (p) => p.id.startsWith('inspect-tree-') || p.id.startsWith('data-panel-'),
        );
        expect(dense.length).toBeGreaterThan(0);
        for (const p of dense) {
            expect(p.minLevel, p.id).toBe('AAA');
        }
    });
});

describe('auditTokenPairs', () => {
    it('the full registry has ZERO failing pairs', () => {
        const report = auditTokenPairs();
        // If this fails, a designer introduced a token pair that
        // violates the C43 §1.5 contrast requirements — see the
        // failing array for the specific pairs.
        if (report.failing.length > 0) {
            const detail = report.failing
                .map(
                    (f) =>
                        `${f.pair.id}: ratio ${f.result.ratio.toFixed(2)} < threshold ${f.result.threshold} (level ${f.result.level} ${f.result.size})`,
                )
                .join('\n  ');
            throw new Error(
                `auditTokenPairs: ${report.failing.length} failing pair(s):\n  ${detail}`,
            );
        }
        expect(report.failing.length).toBe(0);
    });

    it('summary counts match the registry size', () => {
        const report = auditTokenPairs();
        expect(report.summary.total).toBe(TOKEN_PAIRS.length);
        expect(report.summary.passCount + report.summary.failCount).toBe(
            report.summary.total,
        );
    });

    it('throws on unknown foreground token', () => {
        const bad: TokenPair[] = [
            {
                id: 'bad',
                foreground: 'does-not-exist' as keyof typeof PRYZM_TOKENS,
                background: 'ink' as keyof typeof PRYZM_TOKENS,
                size: 'normal',
                minLevel: 'AA',
                usage: 'test',
            },
        ];
        expect(() => auditTokenPairs(bad)).toThrow(/unknown foreground/);
    });

    it('flags a failing pair when given one', () => {
        const intentionallyBad: TokenPair[] = [
            {
                id: 'bad-low-contrast',
                foreground: 'border' as keyof typeof PRYZM_TOKENS, // #2A2A36
                background: 'ink' as keyof typeof PRYZM_TOKENS, // #0A0A0F
                size: 'normal',
                minLevel: 'AA',
                usage: 'this should fail — border is too close to ink for body text',
            },
        ];
        const report = auditTokenPairs(intentionallyBad);
        expect(report.failing.length).toBe(1);
        expect(report.failing[0]!.pair.id).toBe('bad-low-contrast');
    });
});
