/**
 * §RESI-ORCH-HIGHLIGHT (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §3) — "click a NUMBER, light the
 * GEOMETRY", and the honesty rules that make it safe.
 *
 * ⭐ WHAT THESE ARMS ARE FOR, stated so nobody weakens them later. A suite that only proved
 * "six subjects exist and a store toggles" would pass just as happily over the two failures this
 * binding is actually exposed to:
 *
 *   1. A ROW THAT IS CLICKABLE WITH NOTHING TO POINT AT. A dead click is indistinguishable from
 *      a broken product AND from "we looked and there is nothing there" — the
 *      §CONTEXT-DATA-HONESTY conflation (failure and emptiness rendering as one value) wearing an
 *      affordance. So availability is asserted per subject, and the FRONTAGE arms are asserted
 *      THREE ways: unrecorded ≠ landlocked ≠ n > 0. Collapsing the first two is precisely the lie
 *      `parcelEdgeClassificationDetermination.ts` exists to prevent, and a `?? []` at the call
 *      site would silently re-introduce it — so an arm here passes `undefined` and demands the
 *      "missing measurement" wording rather than the "landlocked" wording.
 *
 *   2. EMPHASIS THAT STRENGTHENS A CLAIM. The envelope's hue and fill alpha ARE its honesty
 *      signal (confident violet · provisional grey · suggested amber · study teal; near-wireframe
 *      for an upper bound). Brightening a provisional solid to "highlight" it would make an
 *      ESTIMATE read as a DETERMINATION — the §L-616 overstatement, re-introduced by a UI
 *      affordance rather than by a rule pack. So the emphasis rule is asserted as a total table
 *      (every subject × every role) and the recede factor is asserted to be a MULTIPLIER strictly
 *      inside (0, 1): a fixed target alpha could make a near-wireframe shell DENSER while it
 *      recedes than it was authored.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    SITE_HIGHLIGHT_SUBJECTS,
    SITE_HIGHLIGHT_MEANING,
    SITE_HIGHLIGHT_ATTR,
    SITE_HIGHLIGHT_RECEDE_FACTOR,
    describeSiteHighlightAvailability,
    describeEdgeHighlightAvailability,
    boundingBoxRingXZ,
    edgeHighlightSubject,
    parseEdgeHighlightSubject,
    describeRoomHighlightAvailability,
    roomHighlightSubject,
    parseRoomHighlightSubject,
    isSiteHighlightSubject,
    siteHighlightCue,
    siteHighlightEmphasis,
    getSiteHighlight,
    setSiteHighlight,
    toggleSiteHighlight,
    subscribeSiteHighlight,
    __resetSiteHighlightForTests,
    type SiteHighlightRole,
    type SiteHighlightInputs,
} from '../siteGeometryHighlight';

afterEach(() => {
    __resetSiteHighlightForTests();
});

/** A parcel that has everything: a ring, classified edges with one frontage, a solved inset,
 *  a derived height and a derived GFA. Every arm below removes exactly one of those. */
const COMPLETE: SiteHighlightInputs = {
    parcelRingLength: 4,
    edgeClassifications: ['front', 'side', 'back', 'side'],
    footprintRingLength: 4,
    maxHeightM: 16,
    gfaM2: 420,
};

describe('§RESI-ORCH-HIGHLIGHT — availability: a row may only be clickable when it has geometry', () => {
    it('makes all six clickable on a fully determined parcel', () => {
        const a = describeSiteHighlightAvailability(COMPLETE);
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            expect(a[s].available, `${s} should be available`).toBe(true);
        }
    });

    it('states a non-empty reason on BOTH arms — an available row says what will light up', () => {
        const yes = describeSiteHighlightAvailability(COMPLETE);
        const no = describeSiteHighlightAvailability({
            parcelRingLength: 0,
            edgeClassifications: undefined,
            footprintRingLength: 0,
            maxHeightM: null,
            gfaM2: null,
        });
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            expect(yes[s].reason.length, `${s} available reason`).toBeGreaterThan(0);
            expect(no[s].reason.length, `${s} unavailable reason`).toBeGreaterThan(0);
        }
    });

    it('turns EVERY subject off when there is no committed parcel ring', () => {
        const a = describeSiteHighlightAvailability({
            ...COMPLETE,
            parcelRingLength: 2, // degenerate: fewer than three vertices is not a plot
            footprintRingLength: 0,
        });
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            expect(a[s].available, `${s}`).toBe(false);
        }
    });

    // ── THE THREE FRONTAGE ARMS. This is the sharpest case and the reason the module exists. ──

    it('frontage — NOT RECORDED reads as a missing measurement, never as a finding', () => {
        const a = describeSiteHighlightAvailability({ ...COMPLETE, edgeClassifications: undefined });
        expect(a.frontage.available).toBe(false);
        expect(a.frontage.reason).toMatch(/missing measurement/i);
        expect(a.frontage.reason).not.toMatch(/landlocked/i);
    });

    it('frontage — CLASSIFIED-AND-LANDLOCKED reads as a real finding, never as a gap', () => {
        const a = describeSiteHighlightAvailability({
            ...COMPLETE,
            edgeClassifications: ['side', 'side', 'back', 'side'],
        });
        expect(a.frontage.available).toBe(false);
        expect(a.frontage.reason).toMatch(/landlocked/i);
        expect(a.frontage.reason).not.toMatch(/missing measurement/i);
    });

    it('frontage — the two unavailable arms do NOT share a sentence', () => {
        const unrecorded = describeSiteHighlightAvailability({
            ...COMPLETE,
            edgeClassifications: null,
        }).frontage.reason;
        const landlocked = describeSiteHighlightAvailability({
            ...COMPLETE,
            edgeClassifications: ['side', 'side', 'side', 'side'],
        }).frontage.reason;
        expect(unrecorded).not.toBe(landlocked);
    });

    it('frontage — a WRONG-LENGTH array is unrecorded, not landlocked (the schema `[]` default)', () => {
        // `ParcelBoundarySchema` DEFAULTS `edgeClassifications` to `[]`, so a committed,
        // never-classified parcel carries an empty array against a non-empty polygon. Reading that
        // as "examined, no frontage" is the same defect one notch deeper.
        const a = describeSiteHighlightAvailability({ ...COMPLETE, edgeClassifications: [] });
        expect(a.frontage.available).toBe(false);
        expect(a.frontage.reason).toMatch(/missing measurement/i);
    });

    it('height — refuses to be clickable when the rule pack derived no maximum height', () => {
        const a = describeSiteHighlightAvailability({ ...COMPLETE, maxHeightM: null });
        expect(a.height.available).toBe(false);
        // The whole point: a plane at a guessed height is indistinguishable from a published one.
        expect(a.height.reason).toMatch(/guessed/i);
        // …and the other five are untouched by a missing height.
        expect(a.parcel.available).toBe(true);
        expect(a.footprint.available).toBe(true);
        expect(a.gfa.available).toBe(true);
    });

    it('gfa — refuses to be clickable when the storey count was never derived', () => {
        const a = describeSiteHighlightAvailability({ ...COMPLETE, gfaM2: null });
        expect(a.gfa.available).toBe(false);
        expect(a.gfa.reason).toMatch(/storey count/i);
        expect(a.footprint.available).toBe(true);
    });

    it('footprint — a parcel with no solved inset ring keeps its parcel + boundary rows live', () => {
        const a = describeSiteHighlightAvailability({ ...COMPLETE, footprintRingLength: 0 });
        expect(a.footprint.available).toBe(false);
        expect(a.height.available).toBe(false);
        expect(a.gfa.available).toBe(false);
        expect(a.parcel.available).toBe(true);
        expect(a.boundary.available).toBe(true);
        expect(a.frontage.available).toBe(true);
    });

    it('is total — never throws on garbage input', () => {
        expect(() =>
            describeSiteHighlightAvailability({
                parcelRingLength: Number.NaN,
                edgeClassifications: { nope: true },
                footprintRingLength: -1,
                maxHeightM: 0,
                gfaM2: 0,
            }),
        ).not.toThrow();
    });
});

describe('§RESI-ORCH-HIGHLIGHT — the emphasis rule: emphasis may never strengthen a claim', () => {
    const ROLES: readonly SiteHighlightRole[] = [
        'parcel-line',
        'parcel-fill',
        'envelope-volume',
        'study-volume',
        'proposal',
        'cue',
    ];

    it('recedes by a MULTIPLIER strictly inside (0, 1) — never a target alpha', () => {
        expect(SITE_HIGHLIGHT_RECEDE_FACTOR).toBeGreaterThan(0);
        expect(SITE_HIGHLIGHT_RECEDE_FACTOR).toBeLessThan(1);
    });

    it('is total — every subject × role pair decides, and only ever to two values', () => {
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            for (const r of ROLES) {
                expect(['subject', 'recede'], `${s}/${r}`).toContain(siteHighlightEmphasis(s, r));
            }
        }
    });

    it('never recedes a CUE — geometry that exists only to answer a highlight IS the answer', () => {
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            expect(siteHighlightEmphasis(s, 'cue'), `${s}`).toBe('subject');
        }
    });

    it('Area lights the plot as one thing; Perimeter lights the ring ALONE', () => {
        // A length is measured ALONG a line, so the fill is not part of the perimeter's answer.
        expect(siteHighlightEmphasis('parcel', 'parcel-fill')).toBe('subject');
        expect(siteHighlightEmphasis('parcel', 'parcel-line')).toBe('subject');
        expect(siteHighlightEmphasis('boundary', 'parcel-line')).toBe('subject');
        expect(siteHighlightEmphasis('boundary', 'parcel-fill')).toBe('recede');
    });

    it('GFA lights whichever massing is drawn — plan-backed OR study, never the parcel', () => {
        expect(siteHighlightEmphasis('gfa', 'envelope-volume')).toBe('subject');
        expect(siteHighlightEmphasis('gfa', 'study-volume')).toBe('subject');
        expect(siteHighlightEmphasis('gfa', 'parcel-fill')).toBe('recede');
        expect(siteHighlightEmphasis('gfa', 'parcel-line')).toBe('recede');
    });

    it('the three CONSTRUCTED subjects recede every authored surface', () => {
        // frontage / footprint / height are answered by a cue the renderer builds; if the cue
        // cannot be built nothing is emphasised, which is the honest outcome — never "light the
        // parcel instead", because the reader could not tell that was a substitution.
        for (const s of ['frontage', 'footprint', 'height'] as const) {
            for (const r of ROLES.filter((x) => x !== 'cue')) {
                expect(siteHighlightEmphasis(s, r), `${s}/${r}`).toBe('recede');
            }
        }
    });

    it('never lets the USER PROPOSAL answer a question about the parcel or the law', () => {
        // §RESI-ORCH-TARGET-AREA — all six subjects are facts about the parcel or the ordinance.
        // None of them describes what the user asked for, so lighting the user's own plate when
        // they click "Max footprint" would answer a question about the law with a picture of a wish.
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            expect(siteHighlightEmphasis(s, 'proposal'), s).toBe('recede');
        }
    });

    it('every subject has at least one role or cue that answers it — no subject is inert', () => {
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            const answeredByEmphasis = ROLES.some(
                (r) => r !== 'cue' && siteHighlightEmphasis(s, r) === 'subject',
            );
            const answeredByCue = siteHighlightCue(s) !== null;
            expect(answeredByEmphasis || answeredByCue, `${s} is inert`).toBe(true);
        }
    });

    it('maps exactly the three constructed subjects to a cue, and the other three to none', () => {
        expect(siteHighlightCue('frontage')).toBe('front-edges');
        expect(siteHighlightCue('footprint')).toBe('inset-ring');
        expect(siteHighlightCue('height')).toBe('limit-plane');
        expect(siteHighlightCue('parcel')).toBeNull();
        expect(siteHighlightCue('boundary')).toBeNull();
        expect(siteHighlightCue('gfa')).toBeNull();
    });
});

describe('§RESI-ORCH-HIGHLIGHT — the store: push, not poll', () => {
    it('rests at null so nothing is emphasised until a user asks', () => {
        expect(getSiteHighlight()).toBeNull();
    });

    it('notifies subscribers on a change and NOT on an idempotent re-assert', () => {
        let calls = 0;
        const off = subscribeSiteHighlight(() => { calls += 1; });
        setSiteHighlight('parcel');
        expect(calls).toBe(1);
        setSiteHighlight('parcel');
        expect(calls).toBe(1); // a repaint costs a scene rebuild; unchanged must stay free
        setSiteHighlight('gfa');
        expect(calls).toBe(2);
        off();
        setSiteHighlight(null);
        expect(calls).toBe(2); // unsubscribed
    });

    it('toggles the same subject back to null — click again to clear', () => {
        expect(toggleSiteHighlight('height')).toBe('height');
        expect(getSiteHighlight()).toBe('height');
        expect(toggleSiteHighlight('height')).toBeNull();
        expect(getSiteHighlight()).toBeNull();
    });

    it('switches subject rather than accumulating — only one thing is emphasised at a time', () => {
        toggleSiteHighlight('footprint');
        expect(toggleSiteHighlight('frontage')).toBe('frontage');
        expect(getSiteHighlight()).toBe('frontage');
    });

    it('survives a throwing subscriber — a highlight is a reading aid, not a critical path', () => {
        const seen: string[] = [];
        subscribeSiteHighlight(() => { throw new Error('boom'); });
        subscribeSiteHighlight(() => { seen.push('second ran'); });
        expect(() => setSiteHighlight('boundary')).not.toThrow();
        expect(seen).toEqual(['second ran']);
    });
});

describe('§RESI-ORCH-HIGHLIGHT — the shared vocabulary', () => {
    it('enumerates all SEVEN fixed subjects exactly once — six of STR §3, plus §26.6 rule 2\'s bounding box', () => {
        expect(SITE_HIGHLIGHT_SUBJECTS).toHaveLength(7);
        expect(new Set(SITE_HIGHLIGHT_SUBJECTS).size).toBe(7);
        expect(SITE_HIGHLIGHT_SUBJECTS).toContain('bbox');
    });

    it('gives every subject a physical meaning — STR §3’s "what does this number mean?"', () => {
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            const meaning: string = SITE_HIGHLIGHT_MEANING[s];
            expect(meaning.length, `${s}`).toBeGreaterThan(20);
            expect(meaning.toLowerCase()).toContain('lights');
        }
    });

    it('names ONE DOM attribute, so the card and its wiring cannot disagree', () => {
        expect(SITE_HIGHLIGHT_ATTR).toBe('data-site-highlight');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §26.6 rule 2 (L-13046, founder 2026-09-07) — EVERY FIGURE IS A HYPERLINK: `Bounding box`
// and EVERY EDGE join the vocabulary, through the SAME store and the SAME cue channel.
// ═══════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ The point of these tests is that the two new subjects are NOT a second mechanism: the edge
// is a parametrised value of the ONE union, constructed and parsed in ONE place, answered by ONE
// cue name every renderer switches on. A renderer that forgot the arm fails to compile
// (`ParcelBoundarySceneRenderer.buildHighlightCue` is an exhaustive switch), which is the feature.

/** Every role a surface can tag geometry with — the same closed list the emphasis table is total over. */
const ROLES_266: readonly SiteHighlightRole[] = Object.freeze([
    'parcel-line', 'parcel-fill', 'envelope-volume', 'study-volume', 'proposal', 'cue',
]);

describe('§26.6 rule 2 — the bounding box is a subject', () => {
    it('is available exactly when the ring is, and says what it lights', () => {
        expect(describeSiteHighlightAvailability(COMPLETE).bbox.available).toBe(true);
        expect(describeSiteHighlightAvailability(COMPLETE).bbox.reason.toLowerCase()).toContain('box');
        expect(describeSiteHighlightAvailability({ ...COMPLETE, parcelRingLength: 2 }).bbox.available).toBe(false);
    });

    it('is answered by a CONSTRUCTED cue and recedes every authored surface around it', () => {
        expect(siteHighlightCue('bbox')).toBe('bbox');
        for (const r of ROLES_266.filter((x) => x !== 'cue')) {
            expect(siteHighlightEmphasis('bbox', r), r).toBe('recede');
        }
        expect(siteHighlightEmphasis('bbox', 'cue')).toBe('subject');
    });

    it('boundingBoxRingXZ is the ONE producer of the box — axis-aligned, closed, four corners', () => {
        const ring = [{ x: 3, z: 1 }, { x: 10, z: 4 }, { x: 7, z: 12 }, { x: 1, z: 9 }];
        const box = boundingBoxRingXZ(ring);
        expect(box).toEqual([{ x: 1, z: 1 }, { x: 10, z: 1 }, { x: 10, z: 12 }, { x: 1, z: 12 }]);
        // A degenerate ring has no box worth pointing at.
        expect(boundingBoxRingXZ([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toEqual([]);
    });
});

describe('§26.6 rule 2 / §26.6.2 — every ring edge is a subject, by index', () => {
    it('is constructed and parsed in ONE place, and round-trips', () => {
        expect(edgeHighlightSubject(0)).toBe('edge:0');
        expect(edgeHighlightSubject(17)).toBe('edge:17');
        expect(parseEdgeHighlightSubject('edge:17')).toBe(17);
        expect(parseEdgeHighlightSubject(edgeHighlightSubject(3))).toBe(3);
    });

    it('parses NOTHING ELSE — a fixed subject, a negative, a fraction, garbage', () => {
        expect(parseEdgeHighlightSubject('parcel')).toBeNull();
        expect(parseEdgeHighlightSubject('edge:-1')).toBeNull();
        expect(parseEdgeHighlightSubject('edge:1.5')).toBeNull();
        expect(parseEdgeHighlightSubject('edge:')).toBeNull();
        expect(parseEdgeHighlightSubject(null)).toBeNull();
        expect(parseEdgeHighlightSubject(undefined)).toBeNull();
    });

    it('the type guard admits the fixed subjects and well-formed edges, and nothing else', () => {
        for (const s of SITE_HIGHLIGHT_SUBJECTS) expect(isSiteHighlightSubject(s), s).toBe(true);
        expect(isSiteHighlightSubject('edge:4')).toBe(true);
        expect(isSiteHighlightSubject('edge:x')).toBe(false);
        expect(isSiteHighlightSubject('rooms')).toBe(false);
        expect(isSiteHighlightSubject(null)).toBe(false);
    });

    it('is available for every index INSIDE the ring, and names the gap for one outside it', () => {
        expect(describeEdgeHighlightAvailability(0, 4).available).toBe(true);
        expect(describeEdgeHighlightAvailability(3, 4).available).toBe(true);
        expect(describeEdgeHighlightAvailability(3, 4).reason).toContain('edge 4');
        const outside = describeEdgeHighlightAvailability(4, 4);
        expect(outside.available).toBe(false);
        expect(outside.reason).toContain('outside');
        expect(outside.reason).toContain('not a finding about the plot');
        // No ring, no edge — the same sentence the fixed subjects use.
        expect(describeEdgeHighlightAvailability(0, 2).available).toBe(false);
    });

    it('goes through the ONE store like every other subject', () => {
        setSiteHighlight(edgeHighlightSubject(2));
        expect(getSiteHighlight()).toBe('edge:2');
        expect(toggleSiteHighlight(edgeHighlightSubject(2))).toBeNull();
    });

    it('is answered by the boundary-edge cue and recedes every authored surface — an edge reads as PART of the ring', () => {
        expect(siteHighlightCue(edgeHighlightSubject(1))).toBe('boundary-edge');
        for (const r of ROLES_266.filter((x) => x !== 'cue')) {
            expect(siteHighlightEmphasis(edgeHighlightSubject(1), r), r).toBe('recede');
        }
        expect(siteHighlightEmphasis(edgeHighlightSubject(1), 'cue')).toBe('subject');
    });

    it('⛔ every renderer carries the two new cue arms — a subject nothing draws is a dead click', () => {
        const scene = readFileSync(resolve(__dirname, '../ParcelBoundarySceneRenderer.ts'), 'utf8');
        const cesium = readFileSync(resolve(__dirname, '../../geospatial/CesiumViewport.ts'), 'utf8');
        const map = readFileSync(resolve(__dirname, '../../geospatial/SiteBoundaryMap2D.ts'), 'utf8');
        for (const [name, src] of [['scene', scene], ['cesium', cesium], ['map2d', map]] as const) {
            expect(src, `${name} lacks the bbox arm`).toContain("'bbox'");
            expect(src, `${name} lacks the boundary-edge arm`).toContain("'boundary-edge'");
            expect(src, `${name} does not draw the ONE box`).toContain('boundingBoxRingXZ(');
            expect(src, `${name} parses the edge itself`).toContain('parseEdgeHighlightSubject(');
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §26.6.4 / §ROOMS-ON-THE-VIEWS (L-13046) — `room:<id>`, the SECOND parametrised subject
// ─────────────────────────────────────────────────────────────────────────────
//
// ⭐ WHAT THESE ARMS ARE FOR. The founder's ask is *"THAT SHOULD BE THERE — AND SHALL RENDER ON
// THE VIEWS"*, and the failure mode a naive suite would miss is the one this module opens with:
// a room row that is CLICKABLE with nothing to point at. A room can fail to be pointable for
// THREE unrelated reasons, and two of them are the §CONTEXT-DATA-HONESTY pair — *"nothing has
// detected this room's outline yet"* (a missing measurement) versus *"an outline WAS recorded and
// it is not a polygon"* (a finding about the model). A `?? 0` at the call site collapses the first
// into the second, so an arm below passes `null` and demands the "missing measurement" wording.
describe('§26.6.4 — one ROOM as a subject', () => {
    it('round-trips through ONE constructor and ONE parser, and refuses an empty id', () => {
        expect(roomHighlightSubject('r-42')).toBe('room:r-42');
        expect(parseRoomHighlightSubject('room:r-42')).toBe('r-42');
        // ⛔ An id that cannot name anything is NOT a subject — never `room:`.
        expect(roomHighlightSubject('')).toBeNull();
        expect(roomHighlightSubject('   ')).toBeNull();
        expect(roomHighlightSubject(null)).toBeNull();
        expect(parseRoomHighlightSubject('room:')).toBeNull();
        // The two parametrised subjects never answer for each other.
        expect(parseRoomHighlightSubject('edge:3')).toBeNull();
        expect(parseEdgeHighlightSubject('room:3')).toBeNull();
        expect(parseRoomHighlightSubject('parcel')).toBeNull();
        expect(parseRoomHighlightSubject(undefined)).toBeNull();
        // A room id containing a colon still round-trips — ids are OPAQUE, not parsed further.
        expect(parseRoomHighlightSubject('room:a:b')).toBe('a:b');
    });

    it('the type guard admits a room subject, and still refuses the near-miss "rooms"', () => {
        expect(isSiteHighlightSubject('room:r1')).toBe(true);
        expect(isSiteHighlightSubject('room:')).toBe(false);
        expect(isSiteHighlightSubject('rooms')).toBe(false);
    });

    it('⛔ THREE availability arms, each a DIFFERENT fact — never one sentence for two causes', () => {
        const ok = describeRoomHighlightAvailability('r1', 5, 'Kitchen');
        expect(ok.available).toBe(true);
        expect(ok.reason).toContain('Kitchen');

        // 1. no outline recorded at all — a MISSING MEASUREMENT, and it says so in those terms.
        const none = describeRoomHighlightAvailability('r1', null, 'Kitchen');
        expect(none.available).toBe(false);
        expect(none.reason).toContain('missing measurement');
        expect(none.reason).toContain('NOT a finding');

        // 2. an outline WAS recorded and is not a polygon — a FINDING about the model.
        const degenerate = describeRoomHighlightAvailability('r1', 2, 'Kitchen');
        expect(degenerate.available).toBe(false);
        expect(degenerate.reason).toContain('2 vertices');
        expect(degenerate.reason).toContain('finding about the model');
        // ⛔ The two must not print the same sentence.
        expect(degenerate.reason).not.toBe(none.reason);

        // 3. no id — the record cannot be NAMED, which is neither of the above.
        const nameless = describeRoomHighlightAvailability(null, 6, 'Kitchen');
        expect(nameless.available).toBe(false);
        expect(nameless.reason).toContain('no id');
        expect(nameless.reason).not.toBe(none.reason);
        expect(nameless.reason).not.toBe(degenerate.reason);
    });

    it('every arm states a non-empty reason — an empty one re-creates the dead-click ambiguity', () => {
        for (const a of [
            describeRoomHighlightAvailability('r', 4, 'Bath'),
            describeRoomHighlightAvailability('r', 4, null),
            describeRoomHighlightAvailability('r', null, null),
            describeRoomHighlightAvailability('r', 0, null),
            describeRoomHighlightAvailability(null, null, null),
        ]) {
            expect(a.reason.length).toBeGreaterThan(20);
        }
    });

    it('goes through the ONE store like every other subject', () => {
        setSiteHighlight('room:r9');
        expect(getSiteHighlight()).toBe('room:r9');
        expect(toggleSiteHighlight('room:r9')).toBeNull();
    });

    it('is answered by the room-outline cue and RECEDES every authored surface — including the plate', () => {
        expect(siteHighlightCue('room:r1')).toBe('room-outline');
        for (const r of ROLES_266.filter((x) => x !== 'cue')) {
            expect(siteHighlightEmphasis('room:r1', r), r).toBe('recede');
        }
        // ⛔ The to-be-built plate recedes too: "where is the kitchen" is not answered by also
        // lighting the massing, and a 0.45-alpha plate over a thin outline hides the outline.
        expect(siteHighlightEmphasis('room:r1', 'proposal')).toBe('recede');
        expect(siteHighlightEmphasis('room:r1', 'cue')).toBe('subject');
    });

    it('⛔ ALL THREE renderers carry the room-outline arm, and all three read the ONE outline source', () => {
        const scene = readFileSync(resolve(__dirname, '../ParcelBoundarySceneRenderer.ts'), 'utf8');
        const cesium = readFileSync(resolve(__dirname, '../../geospatial/CesiumViewport.ts'), 'utf8');
        const map = readFileSync(resolve(__dirname, '../../geospatial/SiteBoundaryMap2D.ts'), 'utf8');
        for (const [name, src] of [['scene', scene], ['cesium', cesium], ['map2d', map]] as const) {
            expect(src, `${name} lacks the room-outline arm`).toContain("'room-outline'");
            expect(src, `${name} parses the room subject itself`).toContain('parseRoomHighlightSubject(');
            // ⛔ ONE producer of the ring, or three views light three different shapes for one row.
            expect(src, `${name} does not read the ONE outline source`).toContain('resolveRoomOutline(');
        }
    });
});
