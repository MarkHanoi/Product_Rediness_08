/**
 * §RESI-ORCH-DESIGN-STAGE (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §1/§19/§21) — *"where am I, and what
 * can I do from here?"*, on the far side of the parcel hand-off.
 *
 * ⭐ WHAT THESE ARMS ARE FOR. A stage ladder is the easiest thing in this repo to get wrong in a way
 * that looks right, because every wrong version still renders five pills. The three failures worth
 * pinning:
 *
 *   1. CLAIMING A STAGE WITHOUT ITS EVIDENCE. A stored stage can outlive the thing it describes —
 *      a project sitting at "BIM" with no walls because someone clicked next once. Every arm here
 *      drives the model from artefacts, and one asserts directly that no stage is claimed on an
 *      empty project.
 *   2. READING A MEASUREMENT FAILURE AS AN EMPTY PROJECT. If the model-measurement join throws,
 *      PRYZM does not know what is authored; reporting "you are at Massing" would then be an
 *      assertion of emptiness manufactured out of an error. `measurementFailed` gets its own arm,
 *      and its own sentence, and it must not be the same sentence as "nothing drawn yet".
 *   3. TURNING "PRYZM CANNOT SEE" INTO "YOU HAVE NOT DONE IT". `hasProgramme` is tri-state for
 *      exactly this reason, and the two negative arms are asserted to say different things — one
 *      is a finding about the project, the other an admission about PRYZM.
 */

import { describe, it, expect } from 'vitest';

import {
    DESIGN_STAGES,
    DESIGN_STAGE_LABEL,
    describeDesignStages,
    currentDesignStage,
    type DesignStageInputs,
} from '../designStageModel';

/** Nothing but a committed plot — the state immediately after the parcel hand-off. */
const JUST_A_PARCEL: DesignStageInputs = {
    hasCommittedParcel: true,
    hasResolvedEnvelope: false,
    hasMassingProposal: false,
    hasProgramme: null,
    designedStoreyCount: 0,
    hasRooms: false,
    measurementFailed: false,
};

describe('§RESI-ORCH-DESIGN-STAGE — the stage is DERIVED, never asserted', () => {
    it('claims NO stage on a project that has only a parcel', () => {
        expect(currentDesignStage(JUST_A_PARCEL)).toBeNull();
        const s = describeDesignStages(JUST_A_PARCEL);
        expect(s.some((x) => x.state === 'done' || x.state === 'current')).toBe(false);
    });

    it('reaches Massing from a resolved envelope', () => {
        expect(currentDesignStage({ ...JUST_A_PARCEL, hasResolvedEnvelope: true })).toBe('massing');
    });

    it('reaches Massing from a user PROPOSAL even without a resolved envelope', () => {
        // §5's target-area plate and §MANUALENV159's typed-height study are both massing, and both
        // exist precisely where the ordinance answer is thin.
        expect(currentDesignStage({ ...JUST_A_PARCEL, hasMassingProposal: true })).toBe('massing');
    });

    it('cannot claim BIM on a project with no authored storey', () => {
        const s = describeDesignStages({ ...JUST_A_PARCEL, hasResolvedEnvelope: true });
        const bim = s.find((x) => x.stage === 'bim')!;
        expect(bim.state).not.toBe('done');
        expect(bim.state).not.toBe('current');
    });

    it('reports the FURTHEST reached stage, not the deepest completed prefix', () => {
        // A real project shape: generated from a footprint, so there is a building and rooms but
        // no declared programme. Forcing monotonicity would mean claiming a programme that does
        // not exist, or denying a building that does.
        const s: DesignStageInputs = {
            ...JUST_A_PARCEL,
            hasResolvedEnvelope: true,
            hasProgramme: false,
            designedStoreyCount: 2,
            hasRooms: true,
        };
        expect(currentDesignStage(s)).toBe('bim');
        const strip = describeDesignStages(s);
        expect(strip.find((x) => x.stage === 'requirements')!.state).toBe('available');
        expect(strip.find((x) => x.stage === 'layout')!.state).toBe('done');
        expect(strip.find((x) => x.stage === 'bim')!.state).toBe('current');
    });

    it('never claims Detail — PRYZM has no measurement of detailing', () => {
        const everything: DesignStageInputs = {
            hasCommittedParcel: true,
            hasResolvedEnvelope: true,
            hasMassingProposal: true,
            hasProgramme: true,
            designedStoreyCount: 4,
            hasRooms: true,
            measurementFailed: false,
        };
        expect(currentDesignStage(everything)).toBe('bim');
        const detail = describeDesignStages(everything).find((x) => x.stage === 'detail')!;
        expect(detail.state).toBe('unavailable');
        // …and it says WHY it will not claim it, rather than looking merely unfinished.
        expect(detail.reason).toMatch(/no measurement of how detailed/i);
    });
});

describe('§RESI-ORCH-DESIGN-STAGE — failure is not emptiness', () => {
    it('claims NOTHING when the measurement failed, even with a full model', () => {
        const s: DesignStageInputs = {
            hasCommittedParcel: true,
            hasResolvedEnvelope: true,
            hasMassingProposal: true,
            hasProgramme: true,
            designedStoreyCount: 3,
            hasRooms: true,
            measurementFailed: true,
        };
        expect(currentDesignStage(s)).toBeNull();
        expect(describeDesignStages(s).every((x) => x.state === 'unavailable')).toBe(true);
    });

    it('says FAILED-TO-READ, in different words from "nothing is drawn"', () => {
        const failed = describeDesignStages({ ...JUST_A_PARCEL, measurementFailed: true });
        const empty = describeDesignStages({ ...JUST_A_PARCEL, hasResolvedEnvelope: true });
        const failedBim = failed.find((x) => x.stage === 'bim')!.reason;
        const emptyBim = empty.find((x) => x.stage === 'bim')!.reason;
        expect(failedBim).toMatch(/failure to measure|could not read/i);
        expect(failedBim).not.toBe(emptyBim);
    });
});

describe('§RESI-ORCH-DESIGN-STAGE — "PRYZM cannot see" is not "you have not done it"', () => {
    it('distinguishes an UNREADABLE programme from an ABSENT one', () => {
        const unreadable = describeDesignStages({ ...JUST_A_PARCEL, hasResolvedEnvelope: true, hasProgramme: null })
            .find((x) => x.stage === 'requirements')!;
        const absent = describeDesignStages({ ...JUST_A_PARCEL, hasResolvedEnvelope: true, hasProgramme: false })
            .find((x) => x.stage === 'requirements')!;
        expect(unreadable.reason).not.toBe(absent.reason);
        // The unreadable arm names PRYZM as the subject of the gap.
        expect(unreadable.reason).toMatch(/gap in PRYZM|cannot read/i);
        expect(absent.reason).toMatch(/no programme is declared/i);
    });

    it('never reaches Requirements on a null — only an explicit yes counts', () => {
        const s = describeDesignStages({ ...JUST_A_PARCEL, hasProgramme: null });
        expect(s.find((x) => x.stage === 'requirements')!.state).not.toBe('current');
        expect(s.find((x) => x.stage === 'requirements')!.state).not.toBe('done');
    });
});

describe('§RESI-ORCH-DESIGN-STAGE — the strip contract', () => {
    it('returns one status per stage, in ladder order, with a label each', () => {
        const s = describeDesignStages(JUST_A_PARCEL);
        expect(s.map((x) => x.stage)).toEqual([...DESIGN_STAGES]);
        for (const x of s) expect(x.label).toBe(DESIGN_STAGE_LABEL[x.stage]);
    });

    it('gives EVERY stage a non-empty reason, reached or not', () => {
        for (const inputs of [
            JUST_A_PARCEL,
            { ...JUST_A_PARCEL, hasResolvedEnvelope: true },
            { ...JUST_A_PARCEL, measurementFailed: true },
            { ...JUST_A_PARCEL, hasCommittedParcel: false },
        ]) {
            for (const x of describeDesignStages(inputs)) {
                expect(x.reason.length, `${x.stage}`).toBeGreaterThan(20);
            }
        }
    });

    it('offers AT MOST ONE next step — five next steps is the same as none', () => {
        for (const inputs of [
            JUST_A_PARCEL,
            { ...JUST_A_PARCEL, hasResolvedEnvelope: true },
            { ...JUST_A_PARCEL, hasResolvedEnvelope: true, designedStoreyCount: 2 },
        ]) {
            expect(describeDesignStages(inputs).filter((x) => x.state === 'available').length)
                .toBeLessThanOrEqual(1);
        }
    });

    it('offers NO next step when there is no parcel — the real next step is upstream', () => {
        const s = describeDesignStages({ ...JUST_A_PARCEL, hasCommittedParcel: false });
        expect(s.every((x) => x.state === 'unavailable')).toBe(true);
        expect(s[0]!.reason).toMatch(/no parcel is committed/i);
    });

    it('never throws', () => {
        expect(() =>
            describeDesignStages({
                hasCommittedParcel: true,
                hasResolvedEnvelope: false,
                hasMassingProposal: false,
                hasProgramme: null,
                designedStoreyCount: Number.NaN,
                hasRooms: false,
                measurementFailed: false,
            }),
        ).not.toThrow();
    });
});
