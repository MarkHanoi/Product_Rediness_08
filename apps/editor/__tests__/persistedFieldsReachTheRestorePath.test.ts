// @vitest-environment node
//
// §PERSIST-DEFAULT-PATH — EVERY FIELD THE SERIALISER WRITES MUST REACH A RESTORE PATH.
// ═══════════════════════════════════════════════════════════════════════════════════
//
// ⭐ WHY THIS FILE EXISTS, AND WHY IT DERIVES INSTEAD OF LISTING.
//
// The founder reported "slab types do not survive close/reopen". Four separate lanes
// had already fixed four separate instances of the same bug this week (slab
// `baseOffset`, handrail types, wall rake, curtain-wall types). Every one of them was
// a HAND-WRITTEN FIELD LIST that had drifted from another hand-written field list.
//
// A hand-maintained spreadsheet of "which fields must survive" is the SAME defect one
// level up: correct the day it is written, rotten by the next commit. So this file
// writes down no field names of its own for the covered families. It DERIVES:
//
//   WRITTEN = the object-literal keys returned by `serializeX()` in the live serialiser
//   READ    = the `<record>.<key>` reads inside that family's block in each restore path
//
// and fails when a WRITTEN key reaches NEITHER path and is not on a NAMED ledger below.
// A field added to `serializeWall()` next month is covered by construction.
//
// ─── THE FINDING THIS FILE WAS BORN FROM — three restore paths, not two ─────────────
//
//   1. packages/persistence-client/src/loader/ProjectLoader.ts   — never built by the app
//   2. apps/editor/src/engine/persistence/ProjectLoader.ts       — the LEGACY path
//   3. packages/command-registry/src/project/ImportProjectCommand.ts  — THE DEFAULT PATH
//
// `ProjectLoader._useImportCommandPath()` returns TRUE unless someone sets
// `PRYZM_USE_IMPORT_COMMAND` falsy. Path 2 is its `else` branch. Lanes reasoning about
// "both project loaders" were enumerating a list that had grown a third member, and
// proved their fixes against the branch production does not take
// (§COMMITTED-IS-NOT-REACHABLE). Hence: BOTH live paths are measured here, separately.
//
// ─── WHAT THIS PROVES, AND WHAT IT DOES NOT — stated, not implied ───────────────────
//
// PROVES: that the field NAME is read out of the snapshot record inside the family's
// restore block. That is the exact defect all four instances had — the value sat in the
// file and no line of the restore path ever mentioned it.
//
// DOES NOT PROVE: that the value then reaches the store. A command can accept an option
// and drop it (`L999SideFinishSurvivesReload.test.ts` covers that leg for walls by
// driving the REAL command against the REAL store). Executing `ProjectSerializer
// .serialize()` needs a ~25-store bundle plus `window`, and hand-building those
// neighbours would be the "fake more capable than the real thing" trap. Source-derived
// containment is what can be measured honestly here, and it is named as such.
//
// DOES NOT COVER: `stair` and `handrail`. Their serialisers delegate (`deepStrip(s)` and
// `serializeHandrailRecord(h)`) and return no object literal, so there is no key set to
// derive. That is an HONEST BLANK, asserted below so it cannot rot into a silent skip.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

const SERIALIZER = 'apps/editor/src/engine/persistence/ProjectSerializer.ts';
const DEFAULT_PATH = 'packages/command-registry/src/project/ImportProjectCommand.ts';
const LEGACY_PATH = 'apps/editor/src/engine/persistence/ProjectLoader.ts';
const SHARED_UTILS = 'packages/command-registry/src/project/projectLoaderUtils.ts';

// ── derivation helpers ──────────────────────────────────────────────────────────────

/** Comments are prose: a field named only in a comment is NOT carried. Strip them. */
function decomment(s: string): string {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Text from the first `{` at or after `from` to its matching `}`. */
function braceBlock(src: string, from: number): string {
    const i = src.indexOf('{', from);
    if (i < 0) return '';
    let depth = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
    }
    return '';
}

/** Keys of the object literal `function <fn>()` returns, at brace-depth 1 only. */
function serializedKeys(src: string, fn: string): Set<string> | null {
    const at = src.indexOf(`function ${fn}(`);
    if (at < 0) throw new Error(`${SERIALIZER} no longer declares ${fn}()`);
    const body = decomment(braceBlock(src, at));
    const ret = body.indexOf('return {');
    if (ret < 0) return null;                      // delegated serialiser — see honest blank
    const obj = braceBlock(body, ret + 6);
    const keys = new Set<string>();
    let depth = 0;
    const re = /([{}])|(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(obj))) {
        if (m[1] === '{') { depth++; continue; }
        if (m[1] === '}') { depth--; continue; }
        if (depth === 1 && m[2]) keys.add(m[2]);
    }
    return keys;
}

/** `<v>.<key>` reads inside a block, including `(v as {...}).key` casts. */
function readsIn(block: string, v: string): Set<string> {
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    const direct = new RegExp(`\\b${v}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, 'g');
    while ((m = direct.exec(block))) out.add(m[1]);
    const cast = new RegExp(`\\(\\s*${v}\\s+as[\\s\\S]{0,400}?\\)\\s*\\.\\s*\\??\\.?\\s*([A-Za-z_$][\\w$]*)`, 'g');
    while ((m = cast.exec(block))) out.add(m[1]);
    return out;
}

function blockAfter(src: string, anchor: string): string {
    const at = src.indexOf(anchor);
    if (at < 0) throw new Error(`restore anchor not found — it was renamed or removed: ${anchor}`);
    return braceBlock(src, at + anchor.length - 1);
}

// ── the ledger ──────────────────────────────────────────────────────────────────────
//
// ⛔ THIS LEDGER IS SHRINK-ONLY. A key belongs here for exactly one of two reasons and
// the reason must be written down. Adding a row to silence a failure, rather than
// carrying the field, re-creates the defect this file exists to catch.
//
//   DERIVED    — the restore path re-establishes the value from something else, so not
//                reading it is correct. Must say FROM WHAT.
//   KNOWN-LOSS — the field genuinely does not survive reload. Must carry an L-number.
//                These are DEFECTS parked with a name, never "expected behaviour".

type Ledger = Record<string, Record<string, string>>;

const DERIVED: Ledger = {
    wall:        { type: 'the element KIND — re-established by which Create*Command runs' },
    slab:        { type: 'ditto' },
    column:      { type: 'ditto' },
    curtainWall: { type: 'ditto' },
    plumbing:    { type: 'ditto' },
    furniture:   { type: 'ditto' },
    roof:        { type: 'ditto' },
    beam:        {},
};

const KNOWN_LOSS: Ledger = {
    // `CreateWallCommand`'s payload declares none of these, so carrying them needs a
    // change on the wall command itself — the wall lane's surface, not persistence's.
    wall: {
        parentId:    'L-1215 — host/level parentage lost on reload; payload does not declare it',
        childrenIds: 'L-1215 — same',
        properties:  'L-1215 — the wall MARK lives here; schedules renumber on every reopen',
        metadata:    'L-1215 — createdAt/createdBy/version regenerated as fresh-user-v1',
        loadBearing: 'L-1215 — a structural declaration, authored, not re-derivable',
    },
    slab:        { parentId: 'L-1215 — see wall.parentId' },
    column:      {
        parentId:   'L-1215 — see wall.parentId',
        properties: 'L-1215 — the column MARK; CreateColumnCommand does not declare it',
    },
    beam:        {
        parentId:   'L-1215 — see wall.parentId',
        properties: 'L-1215 — the beam MARK',
        metadata:   'L-1215 — see wall.metadata',
    },
    curtainWall: { parentId: 'L-1215 — see wall.parentId' },
    plumbing:    {
        levelName:      'L-1216 — cached denormalisation of the level; re-derivable but NOT re-derived today',
        levelElevation: 'L-1216 — same',
        properties:     'L-1215 — the fixture MARK',
    },
    furniture:   {
        levelName:       'L-1216 — see plumbing.levelName',
        levelElevation:  'L-1216 — same',
        mark:            'L-1215 — the schedule mark, renumbered on every reopen',
        hostedSpaceId:   'L-1217 — which ROOM the piece belongs to; authored by placement, not re-derived',
        aiElementConfig: 'L-1217 — the AI generation parameters; unrecoverable once dropped',
        properties:      'L-1215 — see wall.properties',
        ifcData:         'L-1215 — the IFC round-trip join key is not threaded for furniture',
    },
    roof:        {
        parentId:   'L-1215 — see wall.parentId',
        properties: 'L-1215 — the roof MARK',
        metadata:   'L-1215 — see wall.metadata',
    },
};

// family → [serialiser fn, default-path source, default anchor, record var, legacy source, legacy anchor]
const FAMILIES: ReadonlyArray<readonly [string, string, 'default' | 'utils', string, string, 'legacy' | 'utils', string]> = [
    ['wall',        'serializeWall',        'default', 'for (const wall of snapshot.walls)',            'wall',  'legacy', 'for (const wall of snapshot.walls)'],
    ['slab',        'serializeSlab',        'default', 'for (const slab of snapshot.slabs)',            'slab',  'legacy', 'for (const slab of snapshot.slabs)'],
    ['column',      'serializeColumn',      'default', 'for (const col of snapshot.columns)',           'col',   'legacy', 'for (const col of snapshot.columns)'],
    ['beam',        'serializeBeam',        'default', 'for (const b of snapshot.beams)',               'b',     'legacy', 'for (const b of snapshot.beams)'],
    ['curtainWall', 'serializeCurtainWall', 'default', 'for (const cw of snapshot.curtainWalls)',       'cw',    'legacy', 'for (const cw of snapshot.curtainWalls)'],
    ['plumbing',    'serializePlumbing',    'default', 'for (const p of snapshot.plumbing)',            'p',     'legacy', 'for (const p of snapshot.plumbing)'],
    // furniture + roof funnel BOTH paths through one shared helper, so the two arms
    // measure the same block — which is the shape the other eight families should reach.
    ['furniture',   'serializeFurniture',   'utils',   'export function buildFurnitureRestorePayload(', 'f',     'utils',  'export function buildFurnitureRestorePayload('],
    ['roof',        'serializeRoof',        'utils',   'export function migrateRoofSnapshotToCommand(', 'roof',  'utils',  'export function migrateRoofSnapshotToCommand('],
];

const SRC = {
    serializer: decomment(read(SERIALIZER)),
    default:    decomment(read(DEFAULT_PATH)),
    legacy:     decomment(read(LEGACY_PATH)),
    utils:      decomment(read(SHARED_UTILS)),
} as const;

function explain(family: string, key: string): string | undefined {
    return DERIVED[family]?.[key] ?? KNOWN_LOSS[family]?.[key];
}

describe('§PERSIST-DEFAULT-PATH — a persisted field must be read by the restore path that ships', () => {
    for (const [family, fn, defSrc, defAnchor, v, legSrc, legAnchor] of FAMILIES) {
        const written = serializedKeys(SRC.serializer, fn);

        it(`${family} — DEFAULT path (ImportProjectCommand) reads every key serializeX() writes`, () => {
            expect(written, `${fn}() stopped returning an object literal`).not.toBeNull();
            const rd = readsIn(blockAfter(SRC[defSrc], defAnchor), v);
            const unexplained = [...written!].filter(k => !rd.has(k) && !explain(family, k));
            expect(
                unexplained,
                `${DEFAULT_PATH} never reads these persisted ${family} fields, and they are on no ledger.\n` +
                `Either carry them into the Create${family} payload, or add a DERIVED/KNOWN-LOSS row\n` +
                `saying WHY — a row without a reason is how this bug got here four times.`,
            ).toEqual([]);
        });

        it(`${family} — LEGACY path (apps/editor ProjectLoader) reads them too`, () => {
            const rd = readsIn(blockAfter(SRC[legSrc], legAnchor), v);
            const unexplained = [...written!].filter(k => !rd.has(k) && !explain(family, k));
            expect(
                unexplained,
                `${LEGACY_PATH} never reads these persisted ${family} fields.\n` +
                `The two paths DIVERGING is the defect — a fix applied to one and not the other\n` +
                `is invisible to the user on whichever branch their flag selects.`,
            ).toEqual([]);
        });
    }

    it('⭐ the founder\'s report — a slab\'s system type reaches the path that actually runs', () => {
        // Pinned by name and not only by the derivation above, because THIS is the
        // regression the founder reported and it must fail loudly and legibly.
        const block = blockAfter(SRC.default, 'for (const slab of snapshot.slabs)');
        for (const field of ['systemTypeId', 'layers', 'baseOffset', 'materialId', 'materialColor', 'properties']) {
            expect(block, `ImportProjectCommand drops slab.${field} again`).toContain(`slab.${field}`);
        }
    });

    it('⭐ the wall RAKE reaches it too — a raked wall must not reload vertical', () => {
        const block = blockAfter(SRC.default, 'for (const wall of snapshot.walls)');
        for (const field of ['rakeAngleDeg', 'sideFinishes', 'layers', 'wallProfile']) {
            expect(block, `ImportProjectCommand drops wall.${field} again`).toContain(`wall.${field}`);
        }
    });
});

describe('§PERSIST-DEFAULT-PATH — the third restore path exists and must stay measured', () => {
    it('the default-on selector still routes through ImportProjectCommand', () => {
        // If this flips, the ledger above measures the wrong branch and every verdict
        // in this file silently changes meaning. Fail loudly rather than drift.
        const src = read(LEGACY_PATH);
        expect(src).toContain('_useImportCommandPath()');
        expect(src, 'the default is no longer ON — re-read which path ships before trusting this file')
            .toMatch(/Default: new path on\s*\n\s*return true;/);
    });
});

describe('§PERSIST-DEFAULT-PATH — honest blanks, asserted so they cannot rot into silence', () => {
    // ⛔ These two are NOT covered. Said out loud, and pinned, because a family quietly
    // missing from a loop is exactly how the enumerated-list defect reproduces itself.
    for (const [family, fn] of [['stair', 'serializeStair'], ['handrail', 'serializeHandrail']] as const) {
        it(`${family} is NOT field-derivable — ${fn}() delegates rather than listing keys`, () => {
            const keys = serializedKeys(SRC.serializer, fn);
            expect(
                keys,
                `${fn}() now returns an object literal. That is an improvement in readability and a\n` +
                `REGRESSION in coverage-by-construction: add ${family} to FAMILIES above so the\n` +
                `derivation measures it, then delete this row.`,
            ).toBeNull();
        });
    }
});
