/**
 * §RESI-STAGE-G — the space-envelope appearance resolver.
 * STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §10 · C114 §9 / §10 / §14 · C84 EI-8a.
 *
 * ⭐ WHAT THIS SUITE IS FOR. "Is the envelope drawn correctly?" splits into a question a
 * screenshot answers (are the triangles in the right place) and one it cannot (did the
 * renderer CHOOSE the right colour, alpha and words). This file pins the second half, and
 * it can do so without a WebGL context because the choice is a pure function.
 */

import { describe, it, expect } from 'vitest';
import { OCCUPANCY_PALETTE, UNCLASSIFIED_FILL } from '@pryzm/room-topology';
import {
    resolveSpaceEnvelopeAppearance,
    SPACE_ENVELOPE_LEVEL_COLOUR,
    SPACE_ENVELOPE_LEVEL_OPACITY,
    SPACE_ENVELOPE_ROOM_OPACITY,
} from '../spaceEnvelopeAppearance';
// §TOBE-ENVELOPE — imported, never re-typed: the point of the arm below is that these two values
// must DIFFER, and a hand-copied literal would keep passing after one of them moved.
import { TO_BE_BUILT_FILL_CSS } from '../../ui/site/toBeBuiltEnvelopeStyle';
import { CONFIDENT_VIOLET_HEX } from '../../ui/site/envelopeRenderStyle';

describe('§RESI-STAGE-G — colour', () => {
    it('⭐ a ROOM tagged with an occupancy takes that occupancy\'s colour from the ROOM palette', () => {
        const kitchen = OCCUPANCY_PALETTE['kitchen'];
        expect(typeof kitchen).toBe('string');
        const a = resolveSpaceEnvelopeAppearance({ role: 'room', occupancy: 'kitchen' });
        expect(a.colour).toBe(kitchen);
        expect(a.colourSource).toBe('occupancy');
    });

    it('⛔ an UNTAGGED room is UNCLASSIFIED — it is never given a colour of its own', () => {
        const a = resolveSpaceEnvelopeAppearance({ id: 'a', role: 'room' });
        const b = resolveSpaceEnvelopeAppearance({ id: 'b', role: 'room' });
        expect(a.colour).toBe(UNCLASSIFIED_FILL);
        expect(a.colourSource).toBe('unclassified');
        // Two untagged rooms look ALIKE. A hash-of-the-id hue would show the user a
        // distinction the model does not hold.
        expect(b.colour).toBe(a.colour);
    });

    it('an occupancy the palette does not know falls back to UNCLASSIFIED, never to a guess', () => {
        const a = resolveSpaceEnvelopeAppearance({ role: 'room', occupancy: 'not-a-real-occupancy' });
        expect(a.colour).toBe(UNCLASSIFIED_FILL);
        expect(a.colourSource).toBe('unclassified');
    });

    it('⭐ the AUTHORED materialColor outranks the palette (the L-127 rule)', () => {
        const a = resolveSpaceEnvelopeAppearance({
            role: 'room', occupancy: 'kitchen', materialColor: '#123456',
        });
        expect(a.colour).toBe('#123456');
        expect(a.colourSource).toBe('authored');
    });

    it('a malformed materialColor is IGNORED, not passed to the renderer', () => {
        const a = resolveSpaceEnvelopeAppearance({ role: 'room', occupancy: 'kitchen', materialColor: 'rediish' });
        expect(a.colourSource).toBe('occupancy');
    });

    it('a LEVEL envelope takes the TO-BE-BUILT colour and never an occupancy colour', () => {
        const a = resolveSpaceEnvelopeAppearance({ role: 'level', occupancy: 'kitchen' });
        expect(a.colour).toBe(SPACE_ENVELOPE_LEVEL_COLOUR);
        expect(a.colour).toBe(TO_BE_BUILT_FILL_CSS);
        expect(a.colourSource).toBe('role-default');
    });

    /**
     * ⛔ THE REGRESSION THIS ARM EXISTS FOR — §TOBE-ENVELOPE (STR §25.2), 2026-09-06.
     *
     * This assertion used to read `expect(a.colour).toBe('#6600FF')`, and `#6600FF` is ALSO
     * `envelopeRenderStyle.CONFIDENT_VIOLET_HEX` — the hue C58 §1.2 reserves for a SOLVED legal
     * determination. So the volume the user invented and the volume the ordinance dictated drew
     * in one colour, nested inside one another, in one scene, and the suite pinned it that way.
     *
     * Colour is the confidence badge before any text is read (L-608), so this is a honesty
     * defect, not a palette preference — and it is exactly the kind that returns the moment
     * someone "unifies" a palette. Pinned against the constant, imported rather than re-typed.
     */
    it('⛔ a LEVEL envelope is NEVER the permitted envelope\'s confident violet (C58 §1.2)', () => {
        const level = resolveSpaceEnvelopeAppearance({ role: 'level' });
        const confidentViolet = `#${CONFIDENT_VIOLET_HEX.toString(16).padStart(6, '0')}`;
        expect(level.colour.toLowerCase()).not.toBe(confidentViolet.toLowerCase());
    });
});

describe('§RESI-STAGE-G — the level prism gets out of the room\'s way', () => {
    it('⛔ THE INVARIANT IS THE ORDERING: a level is more transparent than a room', () => {
        const level = resolveSpaceEnvelopeAppearance({ role: 'level' });
        const room = resolveSpaceEnvelopeAppearance({ role: 'room' });
        expect(level.opacity).toBeLessThan(room.opacity);
        expect(level.opacity).toBe(SPACE_ENVELOPE_LEVEL_OPACITY);
        expect(room.opacity).toBe(SPACE_ENVELOPE_ROOM_OPACITY);
        // Still visible: a fully transparent container is an absent one.
        expect(level.opacity).toBeGreaterThan(0);
    });
});

describe('§RESI-STAGE-G — the label says what the record holds, and nothing it does not', () => {
    it('names the envelope and prints its area and occupancy', () => {
        const a = resolveSpaceEnvelopeAppearance({
            role: 'room', name: 'Kitchen', occupancy: 'kitchen', footprintAreaM2: 12.34,
        });
        expect(a.labelTitle).toBe('Kitchen');
        expect(a.labelSubtitle).toBe('kitchen · 12.3 m²');
        expect(a.labelled).toBe(true);
    });

    it('⛔ an UNNAMED envelope returns a NULL title — a name is never generated from the role', () => {
        expect(resolveSpaceEnvelopeAppearance({ role: 'room' }).labelTitle).toBeNull();
        expect(resolveSpaceEnvelopeAppearance({ role: 'room', name: '   ' }).labelTitle).toBeNull();
    });

    it('⛔ an UNRECORDED area prints a WORD, never 0.0 m²', () => {
        const a = resolveSpaceEnvelopeAppearance({ role: 'room', name: 'Study' });
        expect(a.labelSubtitle).toBe('area not recorded');
        expect(a.labelSubtitle).not.toContain('0.0');
        // A genuine zero is a different fact and prints as a number.
        expect(resolveSpaceEnvelopeAppearance({ role: 'room', footprintAreaM2: 0 }).labelSubtitle)
            .toBe('0.0 m²');
    });

    it('both authorable roles are labelled', () => {
        expect(resolveSpaceEnvelopeAppearance({ role: 'level' }).labelled).toBe(true);
        expect(resolveSpaceEnvelopeAppearance({ role: 'room' }).labelled).toBe(true);
    });

    it('is TOTAL — an empty record resolves rather than throwing', () => {
        const a = resolveSpaceEnvelopeAppearance({});
        expect(a.colour).toBe(UNCLASSIFIED_FILL); // the schema's default role is `room`
        expect(a.labelTitle).toBeNull();
        expect(a.opacity).toBeGreaterThan(0);
    });
});
