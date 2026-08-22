// §HABITABILITY-MINIMA-ARE-JURISDICTIONAL — the properties, not the numbers (L-4412).
//
// ⭐ EVERY ASSERTION IN THIS FILE POINTS AT AN AUTHORITY, NEVER AT A LITERAL, and that
// is the direct lesson of the commit that triggered this lane. `apartmentLayout.test.ts`
// once asserted the literal `11.5` and went red on d11c225d for a reason that was not a
// defect; it was fixed by reading `ROOM_RULES.bedroom.minAreaM2` — the same authority
// the validator reads. Now that the number VARIES BY JURISDICTION AT RUNTIME, **no
// literal can be right at all**: a test that pins 8 is wrong in Málaga and a test that
// pins 12 is wrong in Barcelona. So these tests assert the RULES:
//   • a value never travels without its instrument;
//   • an unknown resolves to the ONE named fallback and is LABELLED, never silently
//     substituted;
//   • the jurisdictions genuinely disagree, and PRYZM honours the disagreement;
//   • the hard-reject gate and the sizing allocator read the SAME authority.
//
// The ONE class of literal that IS allowed here: a number quoted from a primary source
// held in this repo, asserted against the standard that claims to encode it (the Málaga
// block). That is a transcription check, and a transcription check must use the literal
// or it checks nothing.

import { describe, it, expect } from 'vitest';
import {
    ES_CATALUNYA_DECRET_141_2012,
    ES_MALAGA_PGOU_2018,
    GB_ENG_NDSS_2015,
    HABITABILITY_COVERAGE,
    HABITABILITY_STANDARDS,
    PRYZM_BASELINE,
    authorityLabel,
    coverageFor,
    provenanceSentence,
    resolveRoomMinimum,
    roomMinima,
    structuredCountryCount,
} from '../src/workflows/apartmentLayout/rules/habitability/index.js';
import type { HabitabilityBinding } from '../src/workflows/apartmentLayout/rules/habitability/index.js';
import { ROOM_RULES, ALL_ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';
import { ROOM_DIMENSIONS } from '../src/workflows/apartmentLayout/dimensions/roomDimensions.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

/** The 15 country folders under docs/04-reference/jurisdictions/ (measured 2026-08-22). */
const JURISDICTION_FOLDER_CODES = [
    'be', 'ch', 'de', 'dk', 'es', 'fi', 'fr', 'gb', 'it', 'nl', 'no', 'pt', 'sa', 'se', 'us',
] as const;

const bind = (jurisdictionId: string | null, countryCode: string | null = null): HabitabilityBinding => ({
    jurisdictionId,
    countryCode,
    regionKey: null,
    resolution: jurisdictionId ? 'resolved' : 'none',
});

const MALAGA = bind('es-29067-malaga', 'es');
const BARCELONA = bind('es-08019-barcelona', 'es');
const ENGLAND = bind(null, null);   // replaced per-test; England has no registry id
const NOWHERE: HabitabilityBinding = {
    jurisdictionId: null, countryCode: null, regionKey: null, resolution: 'none',
};

describe('§HABITABILITY — provenance travels with every number', () => {
    it('no stated minimum exists without an instrument, a date and a source to chase', () => {
        for (const std of [...HABITABILITY_STANDARDS, PRYZM_BASELINE]) {
            for (const [roomType, m] of Object.entries(std.rooms)) {
                const where = `${std.standardId}/${roomType}`;
                expect(m, where).toBeDefined();
                expect(m!.provenance.instrument.trim().length, where).toBeGreaterThan(0);
                expect(m!.provenance.instrumentDate.trim().length, where).toBeGreaterThan(0);
                expect(m!.provenance.sourceToChase.trim().length, where).toBeGreaterThan(0);
                expect(m!.instrumentRoomTerm.trim().length, where).toBeGreaterThan(0);
            }
        }
    });

    it('`primary-in-repo` is claimed IF AND ONLY IF a repo path is cited', () => {
        // The two are the same fact. A standard that claims the strongest confidence
        // without naming the file it was read from is unfalsifiable, which is the state
        // this whole module exists to refuse.
        for (const std of HABITABILITY_STANDARDS) {
            for (const [roomType, m] of Object.entries(std.rooms)) {
                const p = m!.provenance;
                const where = `${std.standardId}/${roomType}`;
                expect(p.confidence === 'primary-in-repo', where).toBe(p.sourcePath !== null);
            }
        }
    });

    it('a value is never both a PRYZM default and a binding regulation', () => {
        for (const std of HABITABILITY_STANDARDS) {
            for (const [roomType, m] of Object.entries(std.rooms)) {
                const p = m!.provenance;
                if (p.confidence === 'pryzm-default') {
                    expect(p.bindingness, `${std.standardId}/${roomType}`).toBe('guidance');
                }
            }
        }
    });
});

describe('§HABITABILITY — there is EXACTLY ONE fallback, and it is never silent', () => {
    it('the baseline declares no jurisdiction key, so it can never WIN a match', () => {
        // If the baseline could be matched by key it would be a silent substitute for a
        // real ordinance. It is reachable only as the terminal rung of the ladder.
        expect(PRYZM_BASELINE.jurisdictionKeys).toEqual([]);
    });

    it('no regulated standard shares the baseline id, and ids are unique', () => {
        const ids = [...HABITABILITY_STANDARDS.map(s => s.standardId), PRYZM_BASELINE.standardId];
        expect(new Set(ids).size).toBe(ids.length);
        expect(HABITABILITY_STANDARDS.some(s => s.standardId === PRYZM_BASELINE.standardId)).toBe(false);
    });

    it('THE BASELINE IS DERIVED FROM ROOM_RULES, NOT RETYPED — every room type agrees', () => {
        // ⭐ This is the anti-rot property. When the founder next rules on a PRYZM
        // default he edits ROOM_RULES; if someone ever hand-copies those numbers into
        // standards.ts instead, this test goes red on the first divergent ruling.
        for (const rule of ALL_ROOM_RULES) {
            const entry = PRYZM_BASELINE.rooms[rule.type];
            expect(entry, rule.type).toBeDefined();
            expect(entry!.minAreaM2, rule.type).toBe(rule.minAreaM2);
            expect(entry!.minShortSideM, rule.type).toBe(rule.minShortSideM);
        }
    });

    it('an unknown location resolves to the baseline and is LABELLED as unregulated', () => {
        for (const rule of ALL_ROOM_RULES) {
            const r = resolveRoomMinimum(rule.type, NOWHERE);
            expect(r.matchTier, rule.type).toBe('pryzm-baseline');
            expect(r.areaIsRegulated, rule.type).toBe(false);
            expect(r.shortSideIsRegulated, rule.type).toBe(false);
            expect(r.minAreaM2, rule.type).toBe(rule.minAreaM2);
            expect(r.provenance.confidence, rule.type).toBe('pryzm-default');
        }
    });

    it('ABSENT binding is byte-identical to the pre-L-4400 engine', () => {
        // Every un-migrated call site keeps today's numbers exactly. This is what makes
        // the optional argument safe to roll out one seam at a time.
        for (const rule of ALL_ROOM_RULES) {
            expect(roomMinima(rule.type).minAreaM2, rule.type).toBe(rule.minAreaM2);
            expect(roomMinima(rule.type).minShortSideM, rule.type).toBe(rule.minShortSideM);
            expect(roomMinima(rule.type, undefined)).toEqual(roomMinima(rule.type, null));
        }
    });
});

describe('§HABITABILITY — the jurisdictions genuinely disagree, and PRYZM honours it', () => {
    it('⭐ THE DEFECT THAT STARTED THIS: a Barcelona room is NOT judged by the English figure', () => {
        // Asserted as a RELATION between two authorities, never as the literals — so it
        // stays true through any future ruling on either side.
        const bcn = resolveRoomMinimum('master', BARCELONA);
        const ndssMaster = GB_ENG_NDSS_2015.rooms.master!.minAreaM2!;
        expect(bcn.areaIsRegulated).toBe(true);
        expect(bcn.provenance.instrument).toContain('141/2012');
        expect(bcn.minAreaM2).not.toBe(ndssMaster);
    });

    it('⭐ AND THE OTHER DIRECTION: Málaga really does require the 12 m² the founder ruled out for Catalonia', () => {
        // Both are correct law. This is the single fact that proves one column can
        // never be right, and it comes from primary text held in THIS repo.
        const mlg = resolveRoomMinimum('master', MALAGA);
        const bcn = resolveRoomMinimum('master', BARCELONA);
        expect(mlg.areaIsRegulated).toBe(true);
        expect(bcn.areaIsRegulated).toBe(true);
        expect(mlg.minAreaM2).toBeGreaterThan(bcn.minAreaM2);
        expect(mlg.provenance.confidence).toBe('primary-in-repo');
    });

    it('TRANSCRIPTION CHECK — the Málaga figures match Art. 12.2.35 as held on disk', () => {
        // The ONE place literals belong: checking that what we typed equals what the
        // instrument says. The source is cited on the record itself.
        const r = ES_MALAGA_PGOU_2018.rooms;
        expect(r.master!.minAreaM2).toBe(12);      // "un dormitorio … no menor de 12 m²"
        expect(r.bedroom!.minAreaM2).toBe(8);      // "superficie útil mínima de los dormitorios … 8 m²"
        expect(r.kitchen!.minAreaM2).toBe(7);      // "si la cocina es independiente … como mínimo 7 m²"
        expect(r.open_plan!.minAreaM2).toBe(16);   // "salón-comedor … 16 m² para las de uno o dos dormitorios"
        expect(r.open_plan!.minShortSideM).toBe(3.0); // "inscribir en él un círculo de 3 metros de diámetro"
        expect(r.bathroom!.minAreaM2).toBe(3);     // "Baño. 3 m²"
        expect(r.wc!.minAreaM2).toBe(1.5);         // "Aseo 1,5 m²"
        expect(r.master!.provenance.sourcePath).toContain('29067-malaga');
    });

    it('the Catalan decree governs Barcelona even though the resolver returns the CITY id', () => {
        // The registered zoning claim for a Barcelona parcel is 'es-08019-barcelona'
        // (finest wins). The regional instrument reaches it because it ENUMERATES the
        // Catalan registrations as data — no second geography lookup, per ADR-0352.
        expect(ES_CATALUNYA_DECRET_141_2012.jurisdictionKeys).toContain('es-08019-barcelona');
        expect(resolveRoomMinimum('master', BARCELONA).standardId)
            .toBe(ES_CATALUNYA_DECRET_141_2012.standardId);
    });

    it('a country PRYZM has not seeded gets the baseline, NOT a neighbour\'s law', () => {
        // ⛔ No interpolation anywhere. France is adjacent to Spain and shares nothing.
        const fr = resolveRoomMinimum('master', bind(null, 'fr'));
        expect(fr.areaIsRegulated).toBe(false);
        expect(fr.matchTier).toBe('pryzm-baseline');
        expect(fr.minAreaM2).toBe(ROOM_RULES.master.minAreaM2);
    });

    it('England is reachable by its own key and does NOT claim all of the UK', () => {
        // Scotland and Wales have separate regimes; claiming 'gb' would repeat the
        // original defect one border in.
        expect(GB_ENG_NDSS_2015.jurisdictionKeys).toEqual(['gb-eng']);
        expect(GB_ENG_NDSS_2015.jurisdictionKeys).not.toContain('gb');
        const eng = resolveRoomMinimum('master', bind('gb-eng', 'gb'));
        expect(eng.areaIsRegulated).toBe(true);
        expect(eng.provenance.bindingness).toBe('conditional');   // NOT mandatory, even in England
        // A Welsh point (country 'gb', no England key) falls to the baseline.
        expect(resolveRoomMinimum('master', bind(null, 'gb')).areaIsRegulated).toBe(false);
        expect(ENGLAND.jurisdictionId).toBeNull();  // the unused fixture stays honest
    });
});

describe('§HABITABILITY — the ladder is applied PER FIELD, and silence is not permission', () => {
    it('Málaga regulates bedroom AREA and states no WIDTH — the two resolve independently', () => {
        const r = resolveRoomMinimum('bedroom', MALAGA);
        expect(r.areaIsRegulated).toBe(true);
        expect(r.shortSideIsRegulated).toBe(false);
        // The width applied is PRYZM's own, and it is reported as such rather than
        // presented as a Spanish requirement.
        expect(r.minShortSideM).toBe(ROOM_RULES.bedroom.minShortSideM);
        expect(r.shortSideProvenance.confidence).toBe('pryzm-default');
    });

    it('a room type an instrument is SILENT on falls to the baseline, not to zero', () => {
        // Málaga states nothing for `study`. Silence is not "no minimum".
        expect(ES_MALAGA_PGOU_2018.rooms.study).toBeUndefined();
        const r = resolveRoomMinimum('study', MALAGA);
        expect(r.areaIsRegulated).toBe(false);
        expect(r.minAreaM2).toBe(ROOM_RULES.study.minAreaM2);
    });

    it('every seeded standard names what it does NOT cover', () => {
        for (const std of HABITABILITY_STANDARDS) {
            expect(std.notCovered.length, std.standardId).toBeGreaterThan(0);
        }
    });
});

describe('§HABITABILITY — the sentence, which is the founder\'s actual complaint', () => {
    it('an unregulated figure says it is a PRYZM default AND that no standard is loaded', () => {
        const s = provenanceSentence(resolveRoomMinimum('master', NOWHERE), 'Germany');
        expect(s).toContain('PRYZM engineering default');
        expect(s).toContain('NOT a regulation');
        expect(s).toContain('Germany');
        // ⛔ It must never read as a legal requirement.
        expect(s).not.toMatch(/mandatory requirement/);
    });

    it('a regulated figure names the instrument, the clause and the binding force', () => {
        const s = provenanceSentence(resolveRoomMinimum('master', MALAGA), null);
        expect(s).toContain('Plan General de Ordenación Urbanística de Málaga');
        expect(s).toContain('Art. 12.2.35');
        expect(s).toContain('mandatory requirement');
        expect(s).toContain('dormitorio');   // the ordinance's OWN word for the room
    });

    it('an UNVERIFIED citation carries its warning in the same sentence', () => {
        const s = provenanceSentence(resolveRoomMinimum('master', BARCELONA), null);
        expect(s).toContain('141/2012');
        expect(s).toMatch(/NOT been verified/i);
        expect(s).toMatch(/candidate/i);
    });

    it('a regulated AREA with an unregulated WIDTH discloses the mixed provenance', () => {
        const s = provenanceSentence(resolveRoomMinimum('bedroom', MALAGA), null);
        expect(s).toContain('PRYZM default');       // about the width
        expect(s).toContain('states no width');
    });

    it('the short label never claims law it does not have', () => {
        expect(authorityLabel(resolveRoomMinimum('master', NOWHERE)))
            .toBe('PRYZM default — no regulation loaded');
        expect(authorityLabel(resolveRoomMinimum('master', MALAGA))).toContain('verified');
        expect(authorityLabel(resolveRoomMinimum('master', BARCELONA))).toContain('unverified');
    });
});

describe('§HABITABILITY — the coverage audit is checked against the shipped standards', () => {
    it('there is exactly one row per jurisdictions/<cc>/ country folder', () => {
        expect(HABITABILITY_COVERAGE.map(r => r.countryCode).sort())
            .toEqual([...JURISDICTION_FOLDER_CODES].sort());
    });

    it('BOTH DIRECTIONS: a `structured` claim needs a standard, and a standard needs a row', () => {
        // One-way counts rot — the repo has a gate (check-contract-index-equivalence)
        // that exists for exactly this reason. Compare SETS, in both directions.
        for (const row of HABITABILITY_COVERAGE) {
            const shipped = HABITABILITY_STANDARDS.filter(s => s.countryCode === row.countryCode);
            if (row.form === 'structured') {
                expect(shipped.length, row.countryCode).toBeGreaterThan(0);
                expect([...row.standardIds].sort(), row.countryCode)
                    .toEqual(shipped.map(s => s.standardId).sort());
            } else {
                expect(row.standardIds, row.countryCode).toEqual([]);
                expect(shipped.length, row.countryCode).toBe(0);
            }
        }
        for (const std of HABITABILITY_STANDARDS) {
            expect(coverageFor(std.countryCode), std.standardId).toBeDefined();
            expect(coverageFor(std.countryCode)!.form, std.standardId).toBe('structured');
        }
    });

    it('EVERY row names a source to chase, including the ones we already have', () => {
        // A verified number still needs a re-check path when the instrument is amended.
        for (const row of HABITABILITY_COVERAGE) {
            expect(row.namedSourceToChase.trim().length, row.countryCode).toBeGreaterThan(20);
            expect(row.note.trim().length, row.countryCode).toBeGreaterThan(0);
        }
    });

    it('the headline is COMPUTED, so it cannot go stale in prose', () => {
        expect(structuredCountryCount()).toBe(
            HABITABILITY_COVERAGE.filter(r => r.form === 'structured').length,
        );
        // And it is a minority of the tree — the honest shape of this subsystem today.
        expect(structuredCountryCount()).toBeLessThan(JURISDICTION_FOLDER_CODES.length / 2);
    });
});

describe('§HABITABILITY — L-4409: the HARD gate and the allocator read the SAME authority', () => {
    it('the PRYZM baseline is ROOM_RULES, and NOT the comfort framework', () => {
        // ⛔ THE REGRESSION THIS PINS. `enumerate.ts` §DIAG-MIN-AREA-GATE used to read
        // `roomDimensions.areaMin` — a different table, which the founder's own ruling
        // (d11c225d) could not move, so his 12 m² refusal survived his fix. If anyone
        // re-points the gate at the comfort database, `roomMinima` stops agreeing with
        // ROOM_RULES and this goes red.
        for (const type of ['master', 'bedroom', 'living', 'kitchen', 'dining', 'study'] as RoomType[]) {
            expect(roomMinima(type).minAreaM2, type).toBe(ROOM_RULES[type].minAreaM2);
        }
    });

    it('the two rival tables really DO disagree, so the choice of authority is observable', () => {
        // If this ever becomes false the gate's source stops mattering — and this test
        // would be silently vacuous. Assert the disagreement itself.
        const disagreements = (['master', 'bedroom', 'kitchen', 'dining', 'study'] as RoomType[])
            .filter(t => ROOM_RULES[t].minAreaM2 !== ROOM_DIMENSIONS[t].areaMin);
        expect(disagreements.length).toBeGreaterThan(0);
        // And specifically on the room the founder ruled: the comfort floor is STRICTER
        // than the habitability baseline, which is why reading it silently overrode him.
        expect(ROOM_DIMENSIONS.master.areaMin).toBeGreaterThan(ROOM_RULES.master.minAreaM2);
    });
});
