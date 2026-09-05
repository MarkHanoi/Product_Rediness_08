/**
 * spaceEnvelopeAppearance — WHAT COLOUR IS THIS ENVELOPE, HOW SOLID IS IT, AND WHAT DOES
 * ITS LABEL SAY. One resolver, asked by the mesh builder and by nothing else.
 *
 * §RESI-STAGE-G (2026-09-05) · STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §10 ·
 * RESI-ORCHESTRATOR-PLAN §4 Stage G · C114 §9 / §10 / §14 · C84 EI-8a / EI-9.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THE ROOM COLOUR IS NOT INVENTED HERE
 * ═══════════════════════════════════════════════════════════════════════════════
 * The founder asks for room envelopes drawn INSIDE the level prism, each reading as its
 * own space. The obvious implementation — hash the id into a hue — would put a fourth
 * room-colour vocabulary in the repository, and would mean the SAME room reads one colour
 * as an envelope and another once it becomes a room. So the colour comes from
 * `OCCUPANCY_PALETTE`, the palette `RoomColourSystem` already resolves rooms with, keyed
 * on the `occupancy` tag C114 §9 declares as *"a LICENSED COPY of `RoomOccupancyType`"*.
 * An envelope tagged `kitchen` is the kitchen colour before a single wall exists, and
 * stays that colour afterwards.
 *
 * ⛔ AND AN UNTAGGED ROOM IS NOT GIVEN A COLOUR OF ITS OWN. It gets `UNCLASSIFIED_FILL`,
 * imported from the same module rather than re-typed (C84 EI-8a — the cheapest way to
 * have no second copy is to have no second string). Two untagged rooms therefore look
 * alike, which is the honest picture: PRYZM does not know what either of them is, and a
 * palette that invented a distinction would show the user information the model does not
 * hold ([[context-data-honesty-family]]).
 *
 * ⭐ THE AUTHORED VALUE ALWAYS WINS. `materialColor` is the user's own choice and outranks
 * both branches — the L-127 rule, which this family's builder already states: *"a default
 * invented at the draw site silently outranks nothing and shadows the authored override."*
 *
 * ─── OPACITY: THE LEVEL GETS OUT OF THE WAY ──────────────────────────────────
 * A level prism at the room's opacity hides the rooms it contains — the containment this
 * lane just made enforceable would be invisible in the one view that shows it. So the two
 * roles get different alphas, and the ORDERING is the invariant a test pins:
 * `level < room`. The absolute values are style; the ordering is not.
 *
 * ─── PURITY ──────────────────────────────────────────────────────────────────
 * No THREE, no DOM, no store. It maps a record to strings and numbers, so the decision
 * can be tested without a renderer — the half of "is it drawn correctly" that a
 * screenshot cannot answer.
 */

import { OCCUPANCY_PALETTE, UNCLASSIFIED_FILL } from '@pryzm/room-topology';

/**
 * ⭐ PRYZM purple, the LEVEL envelope's colour and the fallback for any role without a
 * palette answer. `#6600FF` — `PreviewStyle.ts` and Contract §41 own the value; an
 * authored envelope is design INTENT rather than built fabric, so it reads in the same
 * idiom the preview does.
 */
export const SPACE_ENVELOPE_LEVEL_COLOUR = '#6600FF';

/**
 * Alphas. ⛔ The INVARIANT is `LEVEL < ROOM` (a test asserts it), not the numbers: the
 * level is a container the user must see THROUGH, and a room is the thing being read.
 */
export const SPACE_ENVELOPE_LEVEL_OPACITY = 0.12;
export const SPACE_ENVELOPE_ROOM_OPACITY = 0.34;
/** Any other role (today only `maximumBuildable`, which cannot be created — C114 §6b). */
export const SPACE_ENVELOPE_OTHER_OPACITY = 0.28;

/** The record fields this resolver reads. Structural over the L0 record. */
export interface SpaceEnvelopeAppearanceInput {
    readonly id?: string;
    readonly role?: string;
    readonly name?: string;
    readonly occupancy?: string;
    readonly materialColor?: string;
    readonly footprintAreaM2?: number;
    readonly height?: number;
}

/** Where the colour came from. Reported so a panel (or a test) can say WHY, not just what. */
export type SpaceEnvelopeColourSource = 'authored' | 'occupancy' | 'unclassified' | 'role-default';

export interface SpaceEnvelopeAppearance {
    /** `#rrggbb`. */
    readonly colour: string;
    readonly colourSource: SpaceEnvelopeColourSource;
    readonly opacity: number;
    /**
     * The label's first line, or `null` when the record carries no name.
     * ⛔ NEVER GENERATED FROM THE ROLE. The schema's own comment on `name` says *"Never
     * generated from the role alone"*, and a label reading "Room" over an unnamed volume
     * is indistinguishable from one the user actually named "Room".
     */
    readonly labelTitle: string | null;
    /** The label's second line — area, and the occupancy when one is tagged. Never empty. */
    readonly labelSubtitle: string;
    /** `true` when this envelope should carry a floating label at all. */
    readonly labelled: boolean;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Resolve one envelope's appearance.
 *
 * Deterministic and total: every input yields an appearance, and an unreadable field
 * falls back rather than throwing — a renderer that threw on a malformed record would
 * take the whole scene down for one bad row.
 */
export function resolveSpaceEnvelopeAppearance(
    record: SpaceEnvelopeAppearanceInput,
): SpaceEnvelopeAppearance {
    const role = record.role ?? 'room';
    const opacity = role === 'level'
        ? SPACE_ENVELOPE_LEVEL_OPACITY
        : role === 'room'
            ? SPACE_ENVELOPE_ROOM_OPACITY
            : SPACE_ENVELOPE_OTHER_OPACITY;

    let colour = SPACE_ENVELOPE_LEVEL_COLOUR;
    let colourSource: SpaceEnvelopeColourSource = 'role-default';

    const authored = record.materialColor?.trim();
    if (authored && HEX.test(authored)) {
        // ⭐ THE AUTHORED VALUE OUTRANKS EVERYTHING. L-127.
        colour = authored;
        colourSource = 'authored';
    } else if (role === 'room') {
        const tag = record.occupancy?.trim();
        const fromPalette = tag ? (OCCUPANCY_PALETTE as Record<string, string | undefined>)[tag] : undefined;
        if (fromPalette) {
            colour = fromPalette;
            colourSource = 'occupancy';
        } else {
            // ⛔ NOT A GENERATED COLOUR. See the header: an untagged room is UNCLASSIFIED,
            // and two untagged rooms looking alike is the true picture.
            colour = UNCLASSIFIED_FILL;
            colourSource = 'unclassified';
        }
    }

    const name = record.name?.trim();
    const area = typeof record.footprintAreaM2 === 'number' && Number.isFinite(record.footprintAreaM2)
        ? record.footprintAreaM2
        : null;
    const tag = record.occupancy?.trim();
    // ⚠ An UNKNOWN area prints as a word, never as `0.0 m²`. Failure and emptiness are
    // the same value and must not be the same message.
    const areaText = area === null ? 'area not recorded' : `${area.toFixed(1)} m²`;
    const labelSubtitle = tag && tag.length > 0 ? `${tag} · ${areaText}` : areaText;

    return {
        colour,
        colourSource,
        opacity,
        labelTitle: name && name.length > 0 ? name : null,
        labelSubtitle,
        // A level envelope is labelled too — it is the storey's declared volume and the
        // figure the intended-area fold reports, so the two surfaces name the same thing.
        labelled: role === 'level' || role === 'room',
    };
}
