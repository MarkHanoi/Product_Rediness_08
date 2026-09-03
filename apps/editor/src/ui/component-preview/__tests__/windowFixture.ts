/**
 * windowFixture — lane U5 test fixture: a Window definition SHAPED LIKE the
 * U-SEED starter (`server/familySeeds.js` buildWindow — same parameters, same
 * §64 formula `GlassWidth = Width - 2 * FrameWidth`, same plane/profile/extrude
 * recipe), with the geometry PARAMETER-BOUND the way `profileToPolygon`'s
 * §4D-ENTITY-READ-CONTRACT provides for (spec §67): profile coordinates are
 * expression strings, so the evaluated mesh REGENERATES from the valuation.
 * That is what makes "Width 1200 → glass 1.050 m, Width 1400 → glass 1.250 m"
 * a measurable geometry fact rather than a table-only number.
 *
 * ⚠ Not passed through `packFamily` here — these specs exercise the bake, which
 * is structural (the packer round-trip is the U3/U-SEED suites' subject). The
 * ids still wear the real prefixes so nothing here normalises a wrong shape.
 */

import type { FamilyDocument, FamilyManifest } from '@pryzm/file-format';
import type { ComponentPreviewFamily } from '../componentPreviewSubject';

const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const STEM = '01ARZ3NDEKTSV4RRFFQ69G5T';
export function ulidN(n: number): string {
    return STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}

export const DEF_ID = `fam_${ulidN(60)}`;
export const TYPE_STD = `typ_${ulidN(61)}`;
export const TYPE_WIDE = `typ_${ulidN(62)}`;
export const P_WIDTH = `par_${ulidN(63)}`;
export const P_HEIGHT = `par_${ulidN(64)}`;
export const P_FRAME = `par_${ulidN(65)}`;
export const P_GLASS = `par_${ulidN(66)}`;
export const PLANE = `plane_${ulidN(67)}`;
export const PROF_FRAME = `prof_${ulidN(68)}`;
export const PROF_GLASS = `prof_${ulidN(69)}`;
export const SOL_FRAME = `sol_${ulidN(70)}`;
export const SOL_GLASS = `sol_${ulidN(71)}`;
export const SOL_BOOL = `sol_${ulidN(72)}`;

const EMPTY_CHECKSUM =
    'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
const NOW = '2026-09-03T00:00:00.000Z';

export interface WindowFixtureOptions {
    /** Replace the §64 expression on GlassWidth (e.g. with a broken one). */
    readonly glassExpression?: string | null;
    /** Append a `boolean` solid the bake must refuse (the partial arm). */
    readonly withBooleanSolid?: boolean;
    /** Drop the two extrude solids (leaves only the boolean, when requested). */
    readonly withoutExtrudes?: boolean;
}

/** Build the fixture family. Values are runtime mm (C110 §3.3); profile
 *  coordinates are expression strings crossing `§4D-ONE-LENGTH-SEAM` → metres. */
export function makeWindowFamily(opts: WindowFixtureOptions = {}): ComponentPreviewFamily {
    const glassExpression =
        opts.glassExpression === undefined ? 'Width - 2 * FrameWidth' : opts.glassExpression;

    const solids: unknown[] = [];
    if (!opts.withoutExtrudes) {
        solids.push(
            {
                id: SOL_FRAME, kind: 'extrude', profileId: PROF_FRAME, materialSlotId: null,
                lod: { coarse: false, medium: true, fine: true },
                lengthExpression: 'FrameWidth', direction: { x: 0, y: 1, z: 0 },
            },
            {
                id: SOL_GLASS, kind: 'extrude', profileId: PROF_GLASS, materialSlotId: null,
                lod: { coarse: false, medium: true, fine: true },
                lengthExpression: '25', direction: { x: 0, y: 1, z: 0 },
            },
        );
    }
    if (opts.withBooleanSolid) {
        solids.push({
            id: SOL_BOOL, kind: 'boolean', operation: 'subtract',
            subjectSolidId: SOL_FRAME, toolSolidId: SOL_GLASS, materialSlotId: null,
            lod: { coarse: false, medium: true, fine: true },
        });
    }

    const document = {
        formatVersion: '1.1',
        referencePlanes: [
            { id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
        ],
        parameters: [
            { id: P_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
            { id: P_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 1500, expression: null, ifcMapping: null, exposed: true },
            { id: P_FRAME, name: 'FrameWidth', kind: 'type', dataType: 'length', defaultValue: 75, expression: null, ifcMapping: null, exposed: true },
            {
                id: P_GLASS, name: 'GlassWidth', kind: 'type', dataType: 'length',
                defaultValue: glassExpression === null ? 1000 : null,
                expression: glassExpression, ifcMapping: null, exposed: true,
            },
        ],
        profiles: [
            {
                id: PROF_FRAME, name: 'WindowFrame', planeId: PLANE,
                entities: [
                    { id: ulidN(80), kind: 'point', data: { x: 0, z: 0 } },
                    { id: ulidN(81), kind: 'point', data: { x: 'Width', z: 0 } },
                    { id: ulidN(82), kind: 'point', data: { x: 'Width', z: 'Height' } },
                    { id: ulidN(83), kind: 'point', data: { x: 0, z: 'Height' } },
                ],
                constraints: [],
            },
            {
                id: PROF_GLASS, name: 'Glazing', planeId: PLANE,
                entities: [
                    { id: ulidN(84), kind: 'point', data: { x: 0, z: 0 } },
                    { id: ulidN(85), kind: 'point', data: { x: 'GlassWidth', z: 0 } },
                    { id: ulidN(86), kind: 'point', data: { x: 'GlassWidth', z: 'Height - 2 * FrameWidth' } },
                    { id: ulidN(87), kind: 'point', data: { x: 0, z: 'Height - 2 * FrameWidth' } },
                ],
                constraints: [],
            },
        ],
        solids,
        materialSlots: [],
        types: [
            { id: TYPE_STD, name: 'Standard', values: {}, checksum: EMPTY_CHECKSUM },
            { id: TYPE_WIDE, name: 'W-1400', values: { [P_WIDTH]: 1400 }, checksum: EMPTY_CHECKSUM },
        ],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;

    // A DISTINCT hash per fixture variant — in production `schemaHash` is the
    // loader's CONTENT hash, so distinct documents never share one; a fixture
    // that reused one hash for different content would falsely indict any cache
    // legitimately keyed on it.
    const variant = [
        glassExpression ?? 'null',
        opts.withBooleanSolid ? 'B' : '-',
        opts.withoutExtrudes ? 'X' : '-',
    ].join('|');
    let vh = 5381;
    for (let i = 0; i < variant.length; i++) vh = ((vh * 33) ^ variant.charCodeAt(i)) >>> 0;
    const schemaHash = `sha256:${vh.toString(16).padStart(8, '0').repeat(8)}`;

    const manifest = {
        formatVersion: '1.1',
        id: DEF_ID,
        name: 'Window',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASU05', displayName: 'lane-u5' },
        description: 'lane U5 preview fixture — the U-SEED Window with parameter-bound glazing',
        ifcEntity: 'IfcWindow',
        category: 'Window',
        tags: ['starter'],
        minPRYZMVersion: '2.0.0',
        schemaHash,
        createdAt: NOW,
        lastModifiedAt: NOW,
    } as unknown as FamilyManifest;

    return {
        manifest,
        document,
        schemaHash,
    };
}

/** Span of a packed xyz Float32Array along one axis — an INDEPENDENT re-measure
 *  of the buffers the subject carries (the test's second source, per
 *  [[probe-can-be-wrong-three-ways]]). */
export function span(position: Float32Array, axis: 0 | 1 | 2): number {
    let min = Infinity;
    let max = -Infinity;
    for (let i = axis; i < position.length; i += 3) {
        const v = position[i]!;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return max - min;
}
