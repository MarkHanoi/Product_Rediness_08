import { describe, expect, it } from 'vitest';
import { detectAlgorithm, algorithmGate } from '../src/gates/algorithmDetector.js';

describe('detectAlgorithm', () => {
    it('detects the Córdoba IND-1 derived ocupación', () => {
        const d = detectAlgorithm('resultante de la aplicación de los parámetros');
        expect(d.isNonNumeric).toBe(true);
        expect(d.rule).toBe('derived');
    });

    it('detects a Catalan derived phrase', () => {
        expect(detectAlgorithm("resultant d'aplicar els paràmetres").rule).toBe('derived');
    });

    it('detects an on-drawing binding (segons plànol)', () => {
        expect(detectAlgorithm('segons plànol O 1.2').rule).toBe('on-drawing');
        expect(detectAlgorithm('según el plano de ordenación').rule).toBe('on-drawing');
    });

    it('does not flag a plain numeric statement', () => {
        expect(detectAlgorithm('altura máxima 15 m').isNonNumeric).toBe(false);
    });
});

describe('algorithmGate', () => {
    it('passes when a rule phrase yields a null value (honest refusal)', () => {
        const g = algorithmGate('resultante de aplicar los parámetros', null);
        expect(g.verdict).toBe('pass');
        expect(g.token).toBe('algorithm:pass-derived');
    });

    it('FLAGS a fabricated number: rule phrase but a number was extracted', () => {
        const g = algorithmGate('resultante de aplicar los parámetros', 0.6);
        expect(g.verdict).toBe('flag');
        expect(g.token).toBe('algorithm:flag-fabricated');
    });

    it('is not-applicable for a plain stated number', () => {
        expect(algorithmGate('15 m', 15).verdict).toBe('not-applicable');
    });
});
