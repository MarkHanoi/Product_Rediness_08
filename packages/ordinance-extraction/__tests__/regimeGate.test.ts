// The legal-regime gate — the contract's Stage -1, which runs before any numeric
// extraction is attempted. Its whole job is to keep "the law defines no number
// here" from ever looking like "we could not find the number".

import { describe, expect, it } from 'vitest';
import { regimeGate, findRegime, type RegimeTable } from '../src/gates/regimeGate.js';
import {
    GERMAN_REGIMES,
    DE_BERLIN_LEGACY_BAUNUTZUNGSPLAN,
} from '../src/grammars/germanRegimes.js';
import { extractRules } from '../src/textExtract/extractor.js';
import { GERMAN_GRAMMAR } from '../src/grammars/german.js';
import { toEnvelopeParameters, findParameter } from '../src/envelope/mapper.js';

const SRC = { document: 'begruendung-test.pdf', page: 1 };
const TEXT = 'Eine Grundflächenzahl (GRZ) von 0,3 wird festgesetzt.';

describe('regimeGate — §30 BauGB sets numbers by law', () => {
    it('passes and allows extraction', () => {
        const r = regimeGate('de-bplan-30', GERMAN_REGIMES);
        expect(r.shouldExtract).toBe(true);
        expect(r.gate.verdict).toBe('pass');
        expect(r.caveat).toBeNull();
        expect(r.forbiddenTiers).toEqual([]);
    });
});

describe('regimeGate — §34/§35 are POSITIVE cited answers, not data gaps', () => {
    it('§34 refuses extraction and carries the cited explanation', () => {
        const r = regimeGate('de-unplanned-34', GERMAN_REGIMES);
        expect(r.shouldExtract).toBe(false);
        expect(r.refusal).toContain('unplanned interior area');
        expect(r.refusal).toContain('case-by-case');
    });

    it('§34 is `not-applicable`, NOT `flag` — nothing went wrong', () => {
        // The distinction matters: a flag says "something may be broken, review it".
        // not-applicable says "this check has nothing to check, by law".
        expect(regimeGate('de-unplanned-34', GERMAN_REGIMES).gate.verdict).toBe(
            'not-applicable',
        );
        expect(regimeGate('de-outlying-35', GERMAN_REGIMES).gate.verdict).toBe(
            'not-applicable',
        );
    });

    it('§35 refuses and explains the privileged-projects exception', () => {
        const r = regimeGate('de-outlying-35', GERMAN_REGIMES);
        expect(r.shouldExtract).toBe(false);
        expect(r.refusal).toContain('§35 BauGB');
    });
});

describe('regimeGate — an unclassified regime NEVER defaults to allowed', () => {
    it('flags and refuses an id that is not in the table', () => {
        const r = regimeGate('de-something-we-invented', GERMAN_REGIMES);
        expect(r.shouldExtract).toBe(false);
        expect(r.gate.verdict).toBe('flag');
        expect(r.gate.token).toBe('regime:flag-unclassified');
        expect(r.regime).toBeNull();
    });

    it('refuses against an EMPTY table rather than waving extraction through', () => {
        const empty: RegimeTable = [];
        expect(regimeGate('de-bplan-30', empty).shouldExtract).toBe(false);
    });
});

describe('regimeGate — the Berlin Baunutzungsplan 1958/60 conditional cap', () => {
    it('allows extraction but flags it and carries the voidance-risk caveat', () => {
        const r = regimeGate(DE_BERLIN_LEGACY_BAUNUTZUNGSPLAN.id, GERMAN_REGIMES);
        expect(r.shouldExtract).toBe(true);
        expect(r.gate.verdict).toBe('flag');
        expect(r.caveat).toContain('funktionslos');
        expect(r.caveat).toContain('2 B 10.17');
    });

    it('forbids the `structured` and `authoritative` tiers permanently', () => {
        const r = regimeGate(DE_BERLIN_LEGACY_BAUNUTZUNGSPLAN.id, GERMAN_REGIMES);
        expect([...r.forbiddenTiers].sort()).toEqual(['authoritative', 'structured']);
    });
});

describe('findRegime', () => {
    it('returns the regime or null — never a fallback', () => {
        expect(findRegime(GERMAN_REGIMES, 'de-bplan-30')?.legalBasis).toBe('BauGB § 30');
        expect(findRegime(GERMAN_REGIMES, 'nope')).toBeNull();
    });

    it('every refusing regime carries a refusal sentence (a silent refusal is a bug)', () => {
        for (const regime of GERMAN_REGIMES) {
            if (regime.numericExtraction === 'refused') {
                expect(regime.refusal, `${regime.id} has no refusal text`).toBeTruthy();
            }
        }
    });
});

describe('regime ↔ envelope mapping integration', () => {
    it('a §34 parcel yields the cited refusal, NOT an envelope of unknowns', () => {
        const out = toEnvelopeParameters(extractRules(TEXT, GERMAN_GRAMMAR, SRC), {
            regime: regimeGate('de-unplanned-34', GERMAN_REGIMES),
        });
        expect(out.ok).toBe(false);
        if (!out.ok) {
            expect(out.reason).toBe('regime-forbids-extraction');
            // The user-facing sentence, carried through verbatim.
            expect(out.detail).toContain('unplanned interior area');
        }
    });

    it('the same text under §30 extracts normally (the regime is what differs)', () => {
        const out = toEnvelopeParameters(extractRules(TEXT, GERMAN_GRAMMAR, SRC), {
            regime: regimeGate('de-bplan-30', GERMAN_REGIMES),
        });
        expect(out.ok).toBe(true);
        if (out.ok) {
            const o = findParameter(out, 'maxCoverage');
            if (o?.status !== 'resolved') throw new Error('expected resolved');
            expect(o.value).toBeCloseTo(0.3, 10);
            expect(o.autoAccepted).toBe(true);
        }
    });

    it('a conditional regime stamps its caveat on every value and blocks auto-accept', () => {
        const out = toEnvelopeParameters(extractRules(TEXT, GERMAN_GRAMMAR, SRC), {
            regime: regimeGate(DE_BERLIN_LEGACY_BAUNUTZUNGSPLAN.id, GERMAN_REGIMES),
        });
        expect(out.ok).toBe(true);
        if (out.ok) {
            const o = findParameter(out, 'maxCoverage');
            if (o?.status !== 'resolved') throw new Error('expected resolved');
            expect(o.value).toBeCloseTo(0.3, 10); // the value survives…
            expect(o.autoAccepted).toBe(false); // …but must be reviewed.
            expect(o.flags.some((f) => f.includes('funktionslos'))).toBe(true);
            expect(out.summary.autoAccepted).toBe(0);
        }
    });

    it('an unclassified regime refuses the mapping rather than extracting blind', () => {
        const out = toEnvelopeParameters(extractRules(TEXT, GERMAN_GRAMMAR, SRC), {
            regime: regimeGate('unknown-regime', GERMAN_REGIMES),
        });
        expect(out).toMatchObject({ ok: false, reason: 'regime-forbids-extraction' });
    });

    it('omitting the regime leaves the mapping regime-blind (caller gated upstream)', () => {
        const out = toEnvelopeParameters(extractRules(TEXT, GERMAN_GRAMMAR, SRC));
        expect(out.ok).toBe(true);
    });
});
