// C28 DAT-α-3 — RuleEvaluator unit tests.

import { describe, expect, it, vi } from 'vitest';
import type { QualityRule } from '@pryzm/schemas';
import {
    PredicateRegistry,
    type PredicateFn,
} from '../src/predicates/PredicateRegistry.js';
import {
    RuleEvaluator,
    createRuleEvaluator,
} from '../src/RuleEvaluator.js';
import { registerBuiltinPredicates } from '../src/predicates/builtins.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const pass: PredicateFn = () => ({ pass: true });
const failNoHint: PredicateFn = () => ({ pass: false });
const failWithHint: PredicateFn = () => ({
    pass: false,
    fixSuggestion: 'Predicate-provided suggestion.',
});
const throwsPred: PredicateFn = () => {
    throw new Error('boom');
};

function rule(overrides: Partial<QualityRule>): QualityRule {
    return {
        id: 'rule.x',
        scope: 'element',
        predicateId: 'pred.x',
        severity: 'error',
        message: 'something is wrong',
        source: 'custom',
        ...overrides,
    };
}

function setupRegistry(): PredicateRegistry {
    const r = new PredicateRegistry();
    r.register('pred.pass', pass);
    r.register('pred.fail', failNoHint);
    r.register('pred.failHint', failWithHint);
    r.register('pred.throws', throwsPred);
    return r;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('RuleEvaluator — runRule single', () => {
    it('returns null when the predicate passes', () => {
        const ev = new RuleEvaluator(setupRegistry());
        const r = rule({ predicateId: 'pred.pass' });
        expect(ev.runRule(r, {}, 'el1')).toBeNull();
    });

    it('returns a QualityViolation populated from the rule when failing', () => {
        const ev = new RuleEvaluator(setupRegistry());
        const r = rule({
            id: 'rule.fail',
            predicateId: 'pred.fail',
            severity: 'error',
            message: 'failed',
            fixSuggestion: 'rule-level suggestion',
        });
        const v = ev.runRule(r, {}, 'el-7');
        expect(v).not.toBeNull();
        expect(v?.ruleId).toBe('rule.fail');
        expect(v?.elementId).toBe('el-7');
        expect(v?.severity).toBe('error');
        expect(v?.message).toBe('failed');
        expect(v?.fixSuggestion).toBe('rule-level suggestion');
    });

    it('honours rule.severity (info / warning / error all flow through)', () => {
        const ev = new RuleEvaluator(setupRegistry());
        for (const sev of ['info', 'warning', 'error'] as const) {
            const v = ev.runRule(rule({ predicateId: 'pred.fail', severity: sev }), {}, 'el');
            expect(v?.severity).toBe(sev);
        }
    });

    it("predicate's fixSuggestion overrides the rule's", () => {
        const ev = new RuleEvaluator(setupRegistry());
        const r = rule({
            predicateId: 'pred.failHint',
            fixSuggestion: 'rule fallback',
        });
        const v = ev.runRule(r, {}, 'el');
        expect(v?.fixSuggestion).toBe('Predicate-provided suggestion.');
    });

    it('falls back to the rule fixSuggestion when the predicate omits one', () => {
        const ev = new RuleEvaluator(setupRegistry());
        const r = rule({ predicateId: 'pred.fail', fixSuggestion: 'rule fallback' });
        const v = ev.runRule(r, {}, 'el');
        expect(v?.fixSuggestion).toBe('rule fallback');
    });

    it('omits fixSuggestion entirely when neither side provides one', () => {
        const ev = new RuleEvaluator(setupRegistry());
        const r = rule({ predicateId: 'pred.fail' });
        const v = ev.runRule(r, {}, 'el');
        expect(v?.fixSuggestion).toBeUndefined();
    });

    it('surfaces an unknown predicateId as a warning violation', () => {
        const ev = new RuleEvaluator(setupRegistry());
        const r = rule({ predicateId: 'pred.does-not-exist' });
        const v = ev.runRule(r, {}, 'el');
        expect(v?.severity).toBe('warning');
        expect(v?.message).toMatch(/Predicate not registered: pred\.does-not-exist/);
    });

    it('catches predicate exceptions and surfaces them as a warning violation', () => {
        const ev = new RuleEvaluator(setupRegistry());
        const r = rule({ predicateId: 'pred.throws' });
        const v = ev.runRule(r, {}, 'el');
        expect(v?.severity).toBe('warning');
        expect(v?.message).toMatch(/Predicate threw: boom/);
    });

    it('forwards siblings through PredicateContext when supplied', () => {
        const r = new PredicateRegistry();
        const seen: Array<ReadonlyArray<Readonly<Record<string, unknown>>> | undefined> = [];
        const probe: PredicateFn = (_el, ctx) => {
            seen.push(ctx.siblings);
            return { pass: true };
        };
        r.register('pred.probe', probe);
        const ev = new RuleEvaluator(r);
        ev.runRule(rule({ predicateId: 'pred.probe' }), {}, 'el', [{ a: 1 }, { b: 2 }]);
        expect(seen[0]).toEqual([{ a: 1 }, { b: 2 }]);
    });
});

describe('RuleEvaluator — runRules collection', () => {
    it('runs every rule and collects only the violating ones', () => {
        const ev = new RuleEvaluator(setupRegistry());
        const rules = [
            rule({ id: 'r.pass', predicateId: 'pred.pass' }),
            rule({ id: 'r.fail', predicateId: 'pred.fail' }),
            rule({ id: 'r.fail2', predicateId: 'pred.failHint' }),
        ];
        const violations = ev.runRules(rules, {}, 'el');
        expect(violations.map((v) => v.ruleId)).toEqual(['r.fail', 'r.fail2']);
    });

    it('empty rules array → empty violations', () => {
        const ev = new RuleEvaluator(setupRegistry());
        expect(ev.runRules([], {}, 'el')).toEqual([]);
    });
});

describe('RuleEvaluator — runRulesOnMany', () => {
    it('returns combined violations across many elements', () => {
        const ev = new RuleEvaluator(setupRegistry());
        const rules = [
            rule({ id: 'r.fail', predicateId: 'pred.fail' }),
            rule({ id: 'r.pass', predicateId: 'pred.pass' }),
        ];
        const out = ev.runRulesOnMany(rules, [
            { id: 'a', data: {} },
            { id: 'b', data: {} },
            { id: 'c', data: {} },
        ]);
        // 1 failing rule × 3 elements = 3 violations, in element order.
        expect(out.length).toBe(3);
        expect(out.map((v) => v.elementId)).toEqual(['a', 'b', 'c']);
    });

    it('onProgress fires once per element with cumulative + total counts', () => {
        const ev = new RuleEvaluator(setupRegistry());
        const calls: Array<[number, number]> = [];
        ev.runRulesOnMany(
            [rule({ predicateId: 'pred.pass' })],
            [
                { id: 'a', data: {} },
                { id: 'b', data: {} },
            ],
            { onProgress: (done, total) => calls.push([done, total]) },
        );
        expect(calls).toEqual([
            [1, 2],
            [2, 2],
        ]);
    });

    it('empty elements array → empty violations', () => {
        const ev = new RuleEvaluator(setupRegistry());
        expect(
            ev.runRulesOnMany([rule({ predicateId: 'pred.fail' })], []),
        ).toEqual([]);
    });

    it('onProgress callback is optional', () => {
        const ev = new RuleEvaluator(setupRegistry());
        const fn = vi.fn();
        ev.runRulesOnMany([rule({ predicateId: 'pred.pass' })], [{ id: 'a', data: {} }]);
        // No throw + no implicit invocation of the unrelated mock.
        expect(fn).not.toHaveBeenCalled();
    });
});

describe('RuleEvaluator — factory', () => {
    it('createRuleEvaluator returns a working evaluator', () => {
        const ev = createRuleEvaluator(setupRegistry());
        expect(ev.runRule(rule({ predicateId: 'pred.pass' }), {}, 'el')).toBeNull();
    });
});

describe('RuleEvaluator — round-trip with builtins', () => {
    it('builtins + matching rules produces the expected violations', () => {
        const registry = new PredicateRegistry();
        registerBuiltinPredicates(registry);
        const ev = new RuleEvaluator(registry);

        const rules: ReadonlyArray<QualityRule> = [
            {
                id: 'q.room.area.min',
                scope: 'room',
                predicateId: 'room.areaMin',
                severity: 'error',
                message: 'Room too small.',
                source: 'g-class',
            },
            {
                id: 'q.door.width.min',
                scope: 'element',
                predicateId: 'door.widthMin',
                severity: 'error',
                message: 'Door too narrow.',
                source: 'g-class',
            },
            {
                id: 'q.wall.length.min',
                scope: 'element',
                predicateId: 'wall.lengthMin',
                severity: 'warning',
                message: 'Wall stub.',
                source: 'g-class',
            },
        ];

        const elements = [
            { id: 'room-1', data: { areaM2: 2.0, heightM: 2.4 } }, // fails areaMin
            { id: 'door-1', data: { widthM: 0.6, heightM: 2.1 } }, // fails widthMin
            { id: 'wall-1', data: { thicknessM: 0.1, lengthM: 3 } }, // passes both
        ];

        const violations = ev.runRulesOnMany(rules, elements);

        // The fixture: room-1 fails areaMin, door-1 fails widthMin,
        // wall-1 has no failing rule. Wall-length rule will also fail
        // for room-1 + door-1 because they have no lengthM (predicate
        // surfaces the missing field as a warning).
        const ruleIds = violations.map((v) => v.ruleId).sort();
        expect(ruleIds).toContain('q.room.area.min');
        expect(ruleIds).toContain('q.door.width.min');

        const room = violations.find(
            (v) => v.ruleId === 'q.room.area.min' && v.elementId === 'room-1',
        );
        expect(room).toBeDefined();
        expect(room?.severity).toBe('error');
        expect(room?.fixSuggestion).toMatch(/at least 4 m²/);

        const door = violations.find(
            (v) => v.ruleId === 'q.door.width.min' && v.elementId === 'door-1',
        );
        expect(door).toBeDefined();
        expect(door?.fixSuggestion).toMatch(/accessibility/);
    });
});
