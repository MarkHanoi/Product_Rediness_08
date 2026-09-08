// §PL-ENVELOPE-AUTHORING — the multi-storey authoring planner, pinned.
//
// ⭐ WHAT THESE CASES ARE FOR. The founder's ask is *"the user here can define the NUMBER OF FLOOR
// LEVELS — of course limited to the parcel law"*, and C114 §12 decides that the storey-count limit
// is an ADVISORY, not a refusal, because the permitted count is a STUDY. The two easiest ways to
// get that wrong are (a) refusing the ask, and (b) silently clamping it to the permitted number.
// Both are asserted against below, by name.
//
// ⛔ A GREEN SUITE HERE IS NOT A USER CAPABILITY. These cases pin a PURE function. The reachability
// half — that the section mounts on the Parcel Law tab and that the button dispatches — is
// `apps/editor/src/ui/analysis/__tests__/parcelLawEnvelopeAuthoring.spec.ts`.

import { describe, it, expect } from 'vitest';
import {
    AUTHORING_MAX_STOREYS,
    buildEnvelopeAuthoringPlan,
    seatableStoreys,
    type EnvelopeAuthoringInput,
} from '../envelopeAuthoringPlan';
import {
    buildAdoptProposalPlan,
    resolveStoreyHeight,
    type AdoptLevelCandidate,
} from '../adoptProposalAsEnvelope';
import { authoredProvenance, systemProvenance } from '@pryzm/schemas/provenance';
import type { ExistingLevelEnvelope, LevelEnvelopeReadResult } from '../levelEnvelopeSupersession';

const RING = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 20 },
    { x: 0, z: 20 },
];

const LEVELS: readonly AdoptLevelCandidate[] = [
    { id: 'lvl-0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'lvl-1', name: 'Level 1', elevation: 3, height: 3 },
    { id: 'lvl-2', name: 'Level 2', elevation: 6, height: null },
    { id: 'lvl-b', name: 'Basement', elevation: -3, height: 3 },
];

const IDS = ['se-1', 'se-2', 'se-3', 'se-4', 'se-5', 'se-6'];

function input(over: Partial<EnvelopeAuthoringInput> = {}): EnvelopeAuthoringInput {
    return {
        ring: RING,
        ringAreaM2: 200,
        ringSourceLabel: 'the permitted buildable footprint',
        requestedStoreys: 2,
        ordinance: { maxHeightM: 12, maxFloors: 4 },
        levels: LEVELS,
        mintedIds: IDS,
        // §ENVELOPE-DRAW R8 — the planner REQUIRES the store read; every case below starts from
        // "readable, empty" and the supersession cases override it.
        existing: { readable: true, rows: [] },
        ...over,
    };
}

/** An envelope already in the store, as `readLevelEnvelopes` returns it. */
function existingRow(over: Partial<ExistingLevelEnvelope> = {}): ExistingLevelEnvelope {
    return {
        id: 'old-1',
        levelId: 'lvl-0',
        name: 'Level envelope · Ground · 200 m²',
        footprintAreaM2: 200,
        provenance: authoredProvenance('user extruded the permitted buildable footprint'),
        ...over,
    };
}
const readable = (rows: readonly ExistingLevelEnvelope[]): LevelEnvelopeReadResult => ({ readable: true, rows });

describe('buildEnvelopeAuthoringPlan — the create gesture', () => {
    it('extrudes the footprint over N storeys as N level envelopes in ONE batch command', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 3 }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.command).toBe('spaceEnvelope.batch.create');
        expect(r.payload.envelopes).toHaveLength(3);
        // Lowest storey first, and the BELOW-DATUM storey is never used.
        expect(r.payload.envelopes.map((e) => e.levelId)).toEqual(['lvl-0', 'lvl-1', 'lvl-2']);
        for (const e of r.payload.envelopes) {
            expect(e.role).toBe('level');
            expect(e.withinId).toBeNull();
            expect(e.footprint).toHaveLength(4);
            expect(e.footprint[0]).toEqual({ x: 0, y: 0, z: 0 });
            expect(e.height).toBeGreaterThan(0);
        }
        expect(r.totalIntendedM2).toBe(600);
    });

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⭐⭐ §ENVELOPE-STOREY-SEAT (L-13146) — N STOREYS ARE N ENVELOPES AT N DISTINCT SEATS
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // The founder set 5 storeys, PRYZM created 5 records on 5 levels, and he reported *"only ground
    // floor"*. Both were true: `baseOffset` was the TYPE LITERAL `0`, so five prisms with the same
    // ring stood in the same place and read as one plate (`drew 5/5 … base=90.22 m` — ONE base).
    //
    // ⛔ THE COUNT WAS NEVER THE BUG AND A COUNT ASSERTION WOULD NEVER HAVE CAUGHT IT. `toHaveLength
    // (3)` above passed throughout. What was missing is an assertion about WHERE they are, so these
    // cases assert the SEATS — distinct, ascending, and equal to the storey elevations the plan
    // itself reports.
    it('⭐ seats each storey envelope at ITS OWN storey elevation — never all at zero', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 3 }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.payload.envelopes.map((e) => e.baseOffset)).toEqual([0, 3, 6]);
    });

    it('⭐ N storeys produce N DISTINCT base offsets — the "only ground floor" invariant', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 3 }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const seats = r.payload.envelopes.map((e) => e.baseOffset);
        expect(new Set(seats).size).toBe(seats.length);
        // Ascending, because `seatableStoreys` sorts by elevation and the seat IS the elevation.
        expect([...seats].sort((a, b) => a - b)).toEqual(seats);
    });

    it('⛔ the seat is the elevation the STOREY ROW reports, not a second answer derived here', () => {
        // One producer: whatever the plan PRINTS as the storey elevation is where it SEATS the
        // prism. A stack summed from the heights would drift from the level records the moment a
        // floor-to-floor is edited without the storeys above it moving — note lvl-1 is 3 m tall and
        // lvl-2 sits at 6 m, so a height-sum and an elevation-read agree here only by luck.
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 3 }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        for (let i = 0; i < r.storeys.length; i++) {
            expect(r.payload.envelopes[i]!.baseOffset).toBe(r.storeys[i]!.elevation);
            expect(r.payload.envelopes[i]!.levelId).toBe(r.storeys[i]!.levelId);
        }
    });

    it('⛔ seats from the CHOSEN start storey, so a stack that starts high is not dropped to 0', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 2, startStoreyId: 'lvl-1' }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.payload.envelopes.map((e) => e.levelId)).toEqual(['lvl-1', 'lvl-2']);
        expect(r.payload.envelopes.map((e) => e.baseOffset)).toEqual([3, 6]);
    });

    it('⚠ two storeys recorded at the SAME elevation still coincide — the MODEL says so, not PRYZM', () => {
        // ⛔ This is not a defect to paper over. Reporting the level records faithfully is the
        // honest answer; inventing a gap would be PRYZM asserting a stack the project does not have.
        const twins: readonly AdoptLevelCandidate[] = [
            { id: 'a', name: 'A', elevation: 0, height: 3 },
            { id: 'b', name: 'B', elevation: 0, height: 3 },
        ];
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 2, levels: twins }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.payload.envelopes.map((e) => e.baseOffset)).toEqual([0, 0]);
        expect(r.payload.envelopes.map((e) => e.levelId)).toEqual(['a', 'b']);
    });

    it('never mints the same element id twice — the batch handler refuses a duplicate', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 3 }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const ids = r.payload.envelopes.map((e) => e.spaceEnvelopeId);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('names an ASSUMED storey height in the element NAME, never silently', () => {
        // lvl-2 carries no height, and the ordinance here publishes neither figure.
        const r = buildEnvelopeAuthoringPlan(
            input({ requestedStoreys: 3, ordinance: { maxHeightM: null, maxFloors: null } }),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const third = r.payload.envelopes[2]!;
        expect(third.height).toBe(3);
        expect(third.name).toContain('height assumed');
        expect(r.statement).toContain('ASSUMED at 3.0 m');
        // The two storeys that DID carry a record do not claim an assumption.
        expect(r.payload.envelopes[0]!.name).not.toContain('assumed');
    });

    it('derives floor-to-floor from the ordinance when the storey record has none', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 3 }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // 12 m ÷ 4 storeys = 3 m, and the SOURCE is carried as a value, not inferred from the number.
        expect(r.storeys[2]!.heightSource).toBe('derived-floor-to-floor');
        expect(r.storeys[0]!.heightSource).toBe('level-record');
    });
});

describe('buildEnvelopeAuthoringPlan — the storey-count verdict (C114 §12: ADVISORY)', () => {
    it('⛔ ADVISES with BOTH numbers when the ask exceeds the derived storey count — and BUILDS', () => {
        const r = buildEnvelopeAuthoringPlan(
            input({
                requestedStoreys: 3,
                ordinance: { maxHeightM: 6, maxFloors: 2 },
            }),
        );
        expect(r.ok).toBe(true);          // ⛔ NOT refused — the permitted count is a STUDY.
        if (!r.ok) return;
        expect(r.advisory).not.toBeNull();
        expect(r.advisory!.askedStoreys).toBe(3);
        expect(r.advisory!.permittedStoreys).toBe(2);
        expect(r.advisory!.statement).toContain('3 floor levels');
        expect(r.advisory!.statement).toContain('derives 2');
        // ⛔ AND IT IS NOT CLAMPED. Three were asked for; three are created.
        expect(r.payload.envelopes).toHaveLength(3);
    });

    it('emits NO advisory when the ordinance published no storey count (the Córdoba case)', () => {
        const r = buildEnvelopeAuthoringPlan(
            input({ requestedStoreys: 3, ordinance: { maxHeightM: null, maxFloors: null } }),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // ⛔ An UNKNOWN limit is not a zero limit: authoring proceeds and nothing is invented.
        expect(r.advisory).toBeNull();
    });

    it('emits no advisory when the ask is within the derived count', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 2 }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.advisory).toBeNull();
    });
});

describe('buildEnvelopeAuthoringPlan — refusals, each with both numbers', () => {
    it('refuses when there is no ring to extrude, and says it is a gap not a finding', () => {
        const r = buildEnvelopeAuthoringPlan(input({ ring: null }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('no-footprint-ring');
        expect(r.statement).toContain('NOT a finding that nothing may be built');
    });

    it('refuses a ring of fewer than three vertices', () => {
        const r = buildEnvelopeAuthoringPlan(input({ ring: [{ x: 0, z: 0 }, { x: 1, z: 1 }] }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('no-footprint-ring');
    });

    it('refuses a non-numeric, zero, negative or fractional storey count', () => {
        expect(buildEnvelopeAuthoringPlan(input({ requestedStoreys: '' })).ok).toBe(false);
        const nan = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 'abc' }));
        expect(nan.ok).toBe(false);
        if (!nan.ok) expect(nan.reason).toBe('storeys-not-a-number');
        for (const bad of [0, -2, 1.5]) {
            const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: bad }));
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('storeys-not-positive');
        }
    });

    it('reads a storey count typed as a STRING, as a text field supplies it', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: '2' }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.payload.envelopes).toHaveLength(2);
    });

    it('refuses above the one-gesture batch limit and says the limit is about the GESTURE', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: AUTHORING_MAX_STOREYS + 1 }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('storeys-above-batch-limit');
        expect(r.statement).toContain('not a statement about what this parcel allows');
    });

    it('⭐ refuses rather than INVENTING a storey, with both numbers and the fix named', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 4 }));   // only 3 at/above datum
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('not-enough-storeys');
        expect(r.statement).toContain('You asked for 4 floor levels');
        expect(r.statement).toContain('this project has 3 storeys');
        expect(r.statement).toContain('will not create a storey');
        // ⛔ And it does not let the reader mistake this for an ordinance verdict.
        expect(r.statement).toContain('says nothing about how many floors this parcel permits');
    });

    it('refuses when the project has no storeys, and when every storey is below the datum', () => {
        const none = buildEnvelopeAuthoringPlan(input({ levels: [] }));
        expect(none.ok).toBe(false);
        if (!none.ok) expect(none.reason).toBe('no-levels');

        const below = buildEnvelopeAuthoringPlan(input({
            levels: [{ id: 'b1', name: 'Basement', elevation: -3, height: 3 }],
        }));
        expect(below.ok).toBe(false);
        if (!below.ok) expect(below.reason).toBe('no-ground-level');
    });

    it('refuses a wiring fault (too few minted ids) as PRYZM\'s gap, not the user\'s', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 3, mintedIds: ['a'] }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('too-few-ids');
        expect(r.statement).toContain("gap in PRYZM's wiring");
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §ENVELOPE-DRAW (C3) — PROVENANCE ON THE PATH THAT ALREADY SHIPS, and REPLACE instead of ACCUMULATE
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('§ENVELOPE-DRAW — every emitted spec carries origin:authored (C58 §1.19 clause 3)', () => {
    it('⭐ stamps `authored` on EVERY storey, with a detail naming the ring source', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 3 }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.payload.envelopes).toHaveLength(3);
        for (const e of r.payload.envelopes) {
            expect(e.provenance.origin).toBe('authored');
            expect(e.provenance.detail).toContain('the permitted buildable footprint');
            expect(e.provenance.detail).toContain('user extruded');
        }
    });

    it('carries the caller\'s own detail verbatim when one is supplied (the drawn route will)', () => {
        const r = buildEnvelopeAuthoringPlan(input({
            provenanceDetail: 'user drew the envelope perimeter on the 3D Site view',
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.payload.envelopes[0]!.provenance).toEqual(authoredProvenance('user drew the envelope perimeter on the 3D Site view'));
    });

    it('⛔ never `predates-provenance`, never a system origin — a grep for authored finds this producer', () => {
        const r = buildEnvelopeAuthoringPlan(input());
        if (!r.ok) throw new Error(r.statement);
        expect(r.payload.envelopes.every((e) => e.provenance.origin === 'authored')).toBe(true);
        expect(r.payload.envelopes.some((e) => e.provenance.origin === 'regenerated')).toBe(false);
    });
});

describe('§ENVELOPE-DRAW R8 — the SECOND press REPLACES what this control authored, in ONE command', () => {
    it('an empty store ⇒ intent `create`, supersedes nothing, the statement ends with the one-undo sentence', () => {
        const r = buildEnvelopeAuthoringPlan(input({ requestedStoreys: 2 }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.intent).toBe('create');
        expect(r.payload.supersedes).toEqual([]);
        expect(r.replaces).toEqual([]);
        expect(r.statement).toContain('One undo removes all of it');
    });

    it('⭐ authored envelopes on the target storeys ⇒ intent `replace`, their ids in `supersedes`, ONE command', () => {
        const r = buildEnvelopeAuthoringPlan(input({
            requestedStoreys: 2,
            existing: readable([
                existingRow({ id: 'old-g', levelId: 'lvl-0' }),
                existingRow({ id: 'old-1', levelId: 'lvl-1', name: 'Level envelope · Level 1 · 200 m²' }),
            ]),
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.intent).toBe('replace');
        expect(r.command).toBe('spaceEnvelope.batch.create');          // ⛔ not a delete + a create
        expect([...r.payload.supersedes].sort()).toEqual(['old-1', 'old-g']);
        expect(r.replaces.map((e) => e.id).sort()).toEqual(['old-1', 'old-g']);
        // The replace half comes FIRST, in the resolver's own voice, and names WHO made it.
        expect(r.statement.indexOf('Replaces')).toBeLessThan(r.statement.indexOf('In their place'));
        expect(r.statement).toContain('you authored earlier');
        expect(r.statement).toContain('ONE undo');
        expect(r.statement).not.toContain('One undo removes all of it');
        // And each replacement STAYS authored — carrying how many it replaced, never `regenerated`.
        for (const e of r.payload.envelopes) {
            expect(e.provenance.origin).toBe('authored');
            expect(e.provenance.detail).toContain('replaced 1 envelope the user authored earlier');
        }
    });

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⭐⭐ §ENVELOPE-CARD-COMPACT (L-13248) — ONE SENTENCE FOR N STOREYS, NOT N PARAGRAPHS
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // The founder's own screenshot: a 6-storey replace printed SIX near-identical paragraphs, each
    // closing "The replacement is ONE undo — Ctrl+Z brings the previous one back" — true of a single
    // supersede command, wrong read six times over when all six land in the SAME
    // `spaceEnvelope.batch.create`. This is the regression pin: it would have FAILED against the
    // prior implementation, which repeated that exact clause once per replaced storey.
    it('⛔ N replaced storeys produce ONE summary clause, never the per-storey undo clause repeated', () => {
        const r = buildEnvelopeAuthoringPlan(input({
            requestedStoreys: 2,
            existing: readable([
                // ⚠ Bare names — `describeLevelEnvelope` appends `· {area} m²` itself whenever
                // `footprintAreaM2` is set, so a name that ALSO embeds an area string would double
                // it up. That is a property of the shared describer, unrelated to this fix, and
                // this fixture is deliberately shaped to exercise it correctly rather than mask it.
                existingRow({ id: 'old-g', levelId: 'lvl-0', name: 'Ground plate' }),
                existingRow({ id: 'old-1', levelId: 'lvl-1', name: 'Level 1 plate' }),
            ]),
        }));
        if (!r.ok) throw new Error(r.statement);
        // The N-storey summary form, naming both storeys and both envelopes by their REAL names —
        // never re-derived, read off the same `ExistingLevelEnvelope` records `supersedes` carries.
        expect(r.statement).toContain('Replaces the level envelope already authored on 2 storeys');
        expect(r.statement).toContain('Ground (Ground plate · 200 m²)');
        expect(r.statement).toContain('Level 1 (Level 1 plate · 200 m²)');
        // ⛔ THE PHRASE THIS PIN EXISTS TO KILL. The old per-storey sentence closed with this exact
        // clause; a regression that re-introduces the N-times join would fail here first.
        expect(r.statement).not.toContain('brings the previous one back');
        // The undo claim survives — stated ONCE, by `createHalf`, correctly for the whole gesture.
        expect(r.statement).toContain('brings back what it replaced and removes all of this');
    });

    it('⭐ PER STOREY — an authored envelope on a storey OUTSIDE the ask is left alone', () => {
        const r = buildEnvelopeAuthoringPlan(input({
            requestedStoreys: 1,
            existing: readable([existingRow({ id: 'upper', levelId: 'lvl-2' })]),
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.intent).toBe('create');
        expect(r.payload.supersedes).toEqual([]);
    });

    it('⛔ a plate PRYZM fitted (`computed`) on a target storey REFUSES the WHOLE gesture — nothing created, nothing deleted', () => {
        const r = buildEnvelopeAuthoringPlan(input({
            requestedStoreys: 2,
            existing: readable([
                existingRow({ id: 'plate', levelId: 'lvl-0', name: 'Proposed ground floor · 301 m²',
                    provenance: systemProvenance('computed', 'fitted by the massing solver') }),
            ]),
        }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('rival-envelope-not-authored');
        expect(r.statement).toContain('On Ground');
        expect(r.statement).toContain('Proposed ground floor · 301 m²');
        expect(r.statement).toContain('not your own authoring');
        expect(r.statement).toContain('Nothing was created and nothing was deleted');
        expect(r.statement).toContain('Nothing was created on ANY storey');
    });

    it('⛔ an envelope with NO readable origin refuses too — unknown sits with "not mine", never with "mine"', () => {
        const r = buildEnvelopeAuthoringPlan(input({
            existing: readable([existingRow({ id: 'legacy', provenance: null })]),
        }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('rival-envelope-not-authored');
        expect(r.statement).toContain('no origin recorded');
    });

    it('⛔ an UNREADABLE store refuses with the read\'s own sentence — never creates blind', () => {
        const r = buildEnvelopeAuthoringPlan(input({
            existing: { readable: false, reason: 'no-store', text: 'This runtime exposes no space-envelope store, so PRYZM cannot see what is already on the storey.' },
        }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('envelopes-unreadable');
        expect(r.statement).toContain('cannot see what is already on the storey');
    });

    it('a mixed storey (one authored, one computed) refuses — one blocker blocks the storey', () => {
        const r = buildEnvelopeAuthoringPlan(input({
            existing: readable([
                existingRow({ id: 'mine', levelId: 'lvl-0' }),
                existingRow({ id: 'plate', levelId: 'lvl-0', provenance: systemProvenance('computed', 'fitted') }),
            ]),
        }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('rival-envelope-not-authored');
    });
});

describe('seatableStoreys', () => {
    it('drops below-datum storeys and orders lowest first, deterministically', () => {
        expect(seatableStoreys(LEVELS).map((l) => l.id)).toEqual(['lvl-0', 'lvl-1', 'lvl-2']);
    });

    it('breaks an elevation tie by id, so two passes cannot disagree on order', () => {
        const tied: readonly AdoptLevelCandidate[] = [
            { id: 'b', name: null, elevation: 0, height: null },
            { id: 'a', name: null, elevation: 0, height: null },
        ];
        expect(seatableStoreys(tied).map((l) => l.id)).toEqual(['a', 'b']);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §PL-ENVELOPE-AUTHORING — THE EXTRACTION IS PINNED HERE, because it had no test before it moved.
//
// `resolveStoreyHeight` was lifted OUT of `buildAdoptProposalPlan` so this lane's planner could
// ask the identical question per storey (C84 EI-9: one answer per question). An extraction with
// no test is a refactor nobody can falsify, so the ladder's three rungs AND the sentence the
// single-envelope planner still produces are asserted below.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('resolveStoreyHeight — the extracted ladder, all three rungs', () => {
    const ORD = { maxHeightM: 12, maxFloors: 4 };

    it('rung 1 — the storey record wins when it carries a positive floor-to-floor', () => {
        const d = resolveStoreyHeight({ height: 2.8 }, ORD);
        expect(d.heightM).toBe(2.8);
        expect(d.heightSource).toBe('level-record');
        expect(d.heightWhy).toContain("the storey's own recorded floor-to-floor");
    });

    it('rung 2 — the ordinance divides, and the sentence says it is an even division for STUDY', () => {
        const d = resolveStoreyHeight({ height: null }, ORD);
        expect(d.heightM).toBe(3);
        expect(d.heightSource).toBe('derived-floor-to-floor');
        expect(d.heightWhy).toContain('not a regulated storey height');
    });

    it('rung 3 — ⛔ the synthesised value is NEVER silent', () => {
        const d = resolveStoreyHeight({ height: null }, { maxHeightM: null, maxFloors: null });
        expect(d.heightM).toBe(3);
        expect(d.heightSource).toBe('assumed-3m');
        expect(d.heightWhy).toContain('an ASSUMED 3.0 m');
    });

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⭐ §ONE-RULE-FOR-THE-NEXT-STOREY (L-13151) — RUNG 2 MUST HAVE SOMETHING TO DIVIDE BY
    // ══════════════════════════════════════════════════════════════════════════════════════════
    it('⛔ maxFloors 1 does NOT make the whole permitted height a storey height', () => {
        // The guard is arithmetic, not taste: `15.3 / 1` is the WHOLE BUILDING, and calling it
        // `'derived-floor-to-floor'` is a name that asserts it is a storey. Rule packs publishing
        // `maxFloors: 1` ship today (esTeldePgo2003 E1P / CO-UN2 / R3).
        const d = resolveStoreyHeight({ height: null }, { maxHeightM: 15.3, maxFloors: 1 });
        expect(d.heightM).toBe(3);
        expect(d.heightSource).toBe('assumed-3m');
        expect(d.heightWhy).toContain('an ASSUMED 3.0 m');
    });

    it('✅ maxFloors 2 still divides — the guard removes only the division that does nothing', () => {
        const d = resolveStoreyHeight({ height: null }, { maxHeightM: 15.3, maxFloors: 2 });
        expect(d.heightM).toBeCloseTo(7.65, 6);
        expect(d.heightSource).toBe('derived-floor-to-floor');
    });

    it('⚠ NO upper plausibility band — a real double-height storey is not overwritten by 3.0', () => {
        // ⛔ Replacing a possibly-right figure with an invented one would be the fabrication this
        // ladder exists to avoid. The guard is about arithmetic, never about architecture.
        const d = resolveStoreyHeight({ height: null }, { maxHeightM: 24, maxFloors: 2 });
        expect(d.heightM).toBe(12);
        expect(d.heightSource).toBe('derived-floor-to-floor');
    });

    it('⭐ the founder\u2019s numbers reproduce his log: 15.3 over 6 floors reads as 2.6 m', () => {
        // `[level@3.0m, level@3.0m, level@2.6m, level@15.3m, level@3.0m]` — the 2.6 is rung 2 at
        // 15.3 / 6 = 2.55, printed to one decimal. That is what identifies 15.3 as the WHOLE
        // permitted height already in play on that parcel, and therefore as a stack figure that
        // reached a single storey record (L-13151), not a floor-to-floor anyone typed.
        const d = resolveStoreyHeight({ height: null }, { maxHeightM: 15.3, maxFloors: 6 });
        expect(d.heightSource).toBe('derived-floor-to-floor');
        expect(d.heightM.toFixed(1)).toBe('2.6');
    });
});

describe('buildAdoptProposalPlan — unchanged by the extraction', () => {
    it('still produces the one-envelope ground-floor plan and names its height source', () => {
        const r = buildAdoptProposalPlan(
            {
                ok: true,
                ring: RING,
                achievedAreaM2: 180,
                targetAreaM2: 180,
                permittedAreaM2: 200,
                insetM: 1,
                statement: 'x',
            },
            LEVELS,
            { maxHeightM: 12, maxFloors: 4 },
            'se-adopt-1',
            // §L-13038 — an EMPTY storey, read successfully. ⛔ Not the same value as a store
            // that could not be read: that arm refuses, and has its own suite.
            { readable: true, rows: [] },
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.payload.envelopes).toHaveLength(1);
        expect(r.payload.envelopes[0]!.levelId).toBe('lvl-0');
        expect(r.payload.supersedes).toEqual([]);
        expect(r.heightSource).toBe('level-record');
        expect(r.statement).toContain("the storey's own recorded floor-to-floor");
    });
});
