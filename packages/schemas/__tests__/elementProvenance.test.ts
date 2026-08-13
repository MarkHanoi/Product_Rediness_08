// PV-04 — every element kind carries provenance in L0, and adding it broke nothing.
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// C75 §0 Finding 2, measured 2026-08-12: `originDetail`, `derivationStatus` and
// `detectionMethod` all read 0 hits in `packages/schemas`. Every `origin:` in
// `src/elements/*` was a geometric `Vec3` — a point, not a provenance. So the
// canonical schema layer had no concept of where any element value came from, and
// a generated, defaulted, imported or repaired element was indistinguishable from
// one the user drew (C75 §0.1). That is how a generated guess ends up in an IFC
// export as a surveyed fact.
//
// ─── WHAT IS ASSERTED, AND WHY EACH ARM EXISTS ───────────────────────────────
// The dangerous half of this change is not "the field exists" — it is C75 §2.5:
// a new field that breaks old-data loading gets reverted, and the revert removes
// provenance rather than fixing the migration (§4.e). So the arms below spend
// most of their weight on the BACKWARD-COMPATIBILITY half:
//
//  0. the pre-change baseline is itself valid, per kind — the FLOOR, without
//     which every arm below can pass vacuously (see PRE_CHANGE_INPUT)
//  1. every kind declares the field           — coverage, per kind, never a
//                                                percentage (§3.1)
//  2. a PRE-CHANGE record (no `provenance` key) still parses, for every kind
//  3. …and lands on UNKNOWN-with-reason, NEVER on a member of the five (§2.1/§2.5
//     are the same rule: the migration must not become a second site that invents
//     provenance)
//  4. the parse is byte-stable across a JSON round trip (§2.5's "parses existing
//     snapshots unchanged" has to survive save, not just load)
//  5. an explicitly-recorded origin survives the round trip intact — a field that
//     defaults correctly but cannot carry a real value is decoration
//  6. the union is not widened and `authored` is not mintable by a system path
//
// ⚠ NOT asserted here, stated so silence is never read as coverage: that any
// PRODUCER actually writes a real origin. Every kind's field defaults to
// `predates-provenance` today, which is honest and empty — instrumenting the
// producers is the `producer-not-instrumented` reason's whole purpose and C75
// §6.3.b records it as a blind spot no static check can see.

import { describe, it, expect } from 'vitest';
import { SCHEMA_REGISTRY } from '../src/registry.js';
import {
    ValueOriginSchema,
    VALUE_ORIGINS,
    systemProvenance,
    authoredProvenance,
} from '../src/provenance/ValueOrigin.js';

type ElementKind = keyof typeof SCHEMA_REGISTRY;

const ELEMENT_TYPES = Object.keys(SCHEMA_REGISTRY) as ElementKind[];

/**
 * ⭐ **The minimum input that makes a kind's record VALID — `{}` for all but one.**
 *
 * Most kinds satisfy `parse({})` by design (`round-trip.test.ts` pins that), so
 * the empty object IS their pre-change shape. `water` does not, and its refusal
 * is deliberate rather than a bug in this test: `Water` refines
 * `surfaceElevation > bottomElevation`, both default to `0`, and the message
 * spells out why — *"an empty pool has no water element"* (§FEAT-SWIMMING-POOL-
 * ELEMENT, ADR-0124). A zero-depth body of water is the ABSENCE of the element.
 *
 * ⚠ **This map is the reason arm 0 exists.** Deriving the pre-change record from
 * `parse({})` — which is what this test did before — makes `water` throw inside
 * the helper, and a kind that cannot even produce a baseline is a kind whose
 * backward compatibility is UNTESTED while five green arms next to it imply
 * otherwise. Worse, the two REJECTION arms would have gone green on `water` *for
 * the wrong reason*: a bad `provenance` and an invalid depth both fail, and
 * `safeParse().success === false` cannot tell them apart. Hence the fixture, the
 * floor that proves it, and the path assertion on every rejection.
 */
const PRE_CHANGE_INPUT: Partial<Record<ElementKind, Record<string, unknown>>> = {
    water: { surfaceElevation: 1, bottomElevation: 0 },
};

/** The valid, provenance-free input a pre-change caller would have supplied. */
function baseInput(type: ElementKind): Record<string, unknown> {
    return { ...(PRE_CHANGE_INPUT[type] ?? {}) };
}

/**
 * The pre-change shape of a record for `type`: exactly what a parse produced
 * BEFORE this commit — i.e. with the `provenance` key stripped. This is C75 §2.5's
 * "verified against a pre-change snapshot", built mechanically from the live
 * schema rather than hand-copied so it cannot drift out of sync.
 */
function preProvenanceRecord(type: ElementKind): Record<string, unknown> {
    const full = SCHEMA_REGISTRY[type].parse(baseInput(type)) as Record<string, unknown>;
    const { provenance: _dropped, ...withoutProvenance } = full;
    return JSON.parse(JSON.stringify(withoutProvenance)) as Record<string, unknown>;
}

/** Every issue path this rejection produced, as dotted strings. */
function issuePaths(err: { issues: ReadonlyArray<{ path: PropertyKey[] }> }): string[] {
    return err.issues.map((i) => i.path.map(String).join('.'));
}

describe('PV-04 · C75 §3 — every element kind carries provenance in packages/schemas', () => {
    it('the registry is the full set the coverage gate measures (floor, not a sample)', () => {
        // If this ever shrinks, the per-kind arms below silently stop covering
        // kinds without a single failure — the C69 §3.5 exit-2 floor idiom, in a
        // test rather than a gate. 27 kinds, matching the gate's own discovery.
        expect(ELEMENT_TYPES.length).toBeGreaterThanOrEqual(27);
    });

    it('every fixture key names a real kind — the map cannot rot into a no-op', () => {
        // A typo'd or renamed key would silently revert that kind to `{}` and
        // reintroduce the vacuous-pass this fixture exists to prevent.
        for (const key of Object.keys(PRE_CHANGE_INPUT)) {
            expect(ELEMENT_TYPES).toContain(key as ElementKind);
        }
    });

    it.each(ELEMENT_TYPES)(
        '%s: the pre-change baseline is itself VALID (arm 0 — the floor under every arm below)',
        (type) => {
            const r = SCHEMA_REGISTRY[type].safeParse(baseInput(type));
            expect(
                r.success,
                `kind '${type}' cannot produce a valid provenance-free record, so its C75 §2.5 ` +
                'backward compatibility is UNTESTED rather than proven. Add the minimum valid ' +
                `payload to PRE_CHANGE_INPUT['${type}'] — never let the kind be skipped.`,
            ).toBe(true);
        },
    );

    it.each(ELEMENT_TYPES)('%s declares a provenance field', (type) => {
        const parsed = SCHEMA_REGISTRY[type].parse(baseInput(type)) as { provenance?: unknown };
        expect(parsed.provenance).toBeDefined();
    });
});

describe('C75 §2.5 — a PRE-CHANGE snapshot still loads, and is not upgraded', () => {
    it.each(ELEMENT_TYPES)('%s: a record written before the field existed parses', (type) => {
        const old = preProvenanceRecord(type);
        expect(old).not.toHaveProperty('provenance');
        expect(() => SCHEMA_REGISTRY[type].parse(old)).not.toThrow();
    });

    it.each(ELEMENT_TYPES)(
        '%s: an absent field lands on UNKNOWN-with-reason, never on one of the five',
        (type) => {
            const parsed = SCHEMA_REGISTRY[type].parse(preProvenanceRecord(type)) as {
                provenance: { origin: unknown; unknownReason?: unknown };
            };
            // ⭐ THE ASSERTION C75 §2.1 IS ABOUT. `roomSnapshotUtils.ts:156` wrote
            // `|| 'auto-topology'` here and silently upgraded an unknown origin to
            // the most authoritative one in its union. An old snapshot proves
            // exactly one thing — that it is old — and that is what is recorded.
            expect(parsed.provenance.origin).toBeNull();
            expect(VALUE_ORIGINS).not.toContain(parsed.provenance.origin);
            // §1.4 — unknown is a VALUE, not a blank. A bare null would be §4.i.
            expect(parsed.provenance.unknownReason).toBe('predates-provenance');
        },
    );

    it.each(ELEMENT_TYPES)('%s: the retrofit is byte-stable across a JSON round trip', (type) => {
        // "Parses existing snapshots unchanged" has to survive SAVE, not just
        // load: a default that re-materialises differently on the second parse
        // makes every old file dirty on open.
        const first = SCHEMA_REGISTRY[type].parse(preProvenanceRecord(type));
        const json1 = JSON.stringify(first);
        const json2 = JSON.stringify(SCHEMA_REGISTRY[type].parse(JSON.parse(json1)));
        expect(json2).toBe(json1);
    });

    it.each(ELEMENT_TYPES)(
        '%s: the ONLY difference from the pre-change record is the added key',
        (type) => {
            // §2.5 says existing snapshots parse UNCHANGED. "Unchanged" has to
            // mean every other field survived untouched, not merely that the
            // parse returned something — a retrofit that reordered or re-defaulted
            // a neighbouring field would still pass every arm above.
            const old = preProvenanceRecord(type);
            const parsed = SCHEMA_REGISTRY[type].parse(old) as Record<string, unknown>;
            const { provenance: _added, ...rest } = parsed;
            expect(JSON.parse(JSON.stringify(rest))).toEqual(old);
        },
    );
});

describe('C75 §1/§2 — the field can carry a REAL origin, not only the default', () => {
    it.each(ELEMENT_TYPES)('%s: a system-recorded origin survives the round trip', (type) => {
        // A field that defaults correctly but cannot carry a stated origin is
        // decoration. `systemProvenance` cannot mint `authored` (its parameter is
        // `SystemWritableOrigin`), which is C75 §2.2 made unrepresentable rather
        // than checked — §2.8's preference order.
        const stated = systemProvenance('computed', 'test: deterministic derivation');
        const parsed = SCHEMA_REGISTRY[type].parse({
            ...baseInput(type),
            provenance: stated,
        }) as { provenance: { origin: unknown; detail?: unknown } };
        expect(parsed.provenance.origin).toBe('computed');
        expect(parsed.provenance.detail).toBe('test: deterministic derivation');

        const reparsed = SCHEMA_REGISTRY[type].parse(
            JSON.parse(JSON.stringify(parsed)),
        ) as { provenance: { origin: unknown } };
        expect(reparsed.provenance.origin).toBe('computed');
    });

    it.each(ELEMENT_TYPES)('%s: an AUTHORED origin is recordable and distinguishable', (type) => {
        // The one origin the system may never invent is still one a human path
        // must be able to state — otherwise the field can never say "this is
        // yours" and C75 §2.6 has nothing to protect.
        const parsed = SCHEMA_REGISTRY[type].parse({
            ...baseInput(type),
            provenance: authoredProvenance('test: user drew it'),
        }) as { provenance: { origin: unknown } };
        expect(parsed.provenance.origin).toBe('authored');

        const defaulted = SCHEMA_REGISTRY[type].parse(baseInput(type)) as {
            provenance: { origin: unknown };
        };
        // The distinguishability itself: a defaulted element is NOT the user's.
        expect(defaulted.provenance.origin).not.toBe(parsed.provenance.origin);
    });

    it.each(ELEMENT_TYPES)('%s: an invalid origin is REJECTED, not coerced', (type) => {
        // C75 §1.2 — the five may not be extended per package. If a kind's field
        // ever degraded to a bare string, this is the arm that notices.
        const bad = SCHEMA_REGISTRY[type].safeParse({
            ...baseInput(type),
            provenance: { origin: 'auto-topology' },
        });
        expect(bad.success).toBe(false);
        // ⚠ …and rejected FOR THIS REASON. A kind with an unrelated failing
        // refinement would otherwise make this arm green while proving nothing
        // about provenance at all (see PRE_CHANGE_INPUT).
        if (!bad.success) expect(issuePaths(bad.error)).toContain('provenance.origin');
    });

    it.each(ELEMENT_TYPES)('%s: an unreasoned unknown is REJECTED — §1.4, not a blank', (type) => {
        const blank = SCHEMA_REGISTRY[type].safeParse({
            ...baseInput(type),
            provenance: { origin: null },
        });
        expect(blank.success).toBe(false);
        if (!blank.success) expect(issuePaths(blank.error)).toContain('provenance.unknownReason');
    });
});

describe('C75 §1.2 — the vocabulary itself is not widened by this retrofit', () => {
    it('is still exactly the five, in C75 §1.1 order', () => {
        expect(ValueOriginSchema.options).toEqual([
            'authored',
            'observed',
            'computed',
            'inferred',
            'regenerated',
        ]);
    });

    it('has no `unknown` member — unknown is a value with a reason, not a sixth origin', () => {
        // A sixth member would immediately become the thing a `??` defaults to,
        // which is the §2.1 defect wearing a different label.
        expect(ValueOriginSchema.safeParse('unknown').success).toBe(false);
    });
});
