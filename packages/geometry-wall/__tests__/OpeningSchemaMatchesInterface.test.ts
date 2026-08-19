// `OpeningSchema` ⟷ `interface Opening` — the header claim, MEASURED.
//
// ─── WHY THIS EXISTS ────────────────────────────────────────────────────────────
//
// `WallDataSchema.ts`'s `OpeningSchema` carries a header that reads *"Matches interface
// Opening in WallTypes.ts exactly."* That is a claim about ANOTHER FILE maintained by a
// comment — C84 §8.d, the mechanism EI-8a records as having already failed repeatedly in
// this subsystem (`joinIntent` drifted out of `WallRakeRoundTrip`'s mirrored field list
// for weeks while that suite reported a complete round-trip).
//
// It failed again as a REPORT rather than as code: during the §WALL-RAKE persistence
// investigation (2026-08-19) a lane reported, as measured, that *"OpeningSchema carries
// NEITHER doorType NOR windowType"* — which would have made the schema a validation
// surface silently narrowing every opening. Re-measured, both fields were present and the
// delta was zero. An unmeasured claim about a validation surface is expensive in exactly
// one direction: it sends the next reader to "restore" fields that are already there.
//
// So the claim stops being a sentence and becomes an executed check. Both declarations
// are read OUT OF SOURCE — never mirrored into a list here, because a mirror is the very
// failure being guarded against.
//
// ─── WHAT THIS DOES **NOT** PROVE, STATED SO NOTHING IS OVERCLAIMED ─────────────
//
// Name parity only. It does not check that a member's TYPE in the interface matches the
// Zod validator on the same key, nor that `.optional()` tracks `?`. Those need a type-level
// check (`z.infer` assignability), which is a compile-time property this runtime suite
// cannot state. Name parity is nonetheless the axis on which every recorded failure of
// this pair has actually occurred: a field present in one and absent from the other.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

function repoRoot(): string {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 12; i++) {
        if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('repo root not found (no pnpm-workspace.yaml above this test)');
}
const REPO = repoRoot();

const SCHEMA_FILE = 'packages/geometry-wall/src/WallDataSchema.ts';
const TYPES_FILE  = 'packages/geometry-wall/src/WallTypes.ts';

/**
 * Members of a `{ … }` block, taken at brace-depth 1 only, with `//` and block comments
 * and string/template literals skipped so a `:` inside prose or inside a Zod message
 * cannot be read as a member. Deliberately the same shape as the extractor
 * `WallProfileNonRegressionBaseline.test.ts` already uses on the serialiser whitelists —
 * one idiom for "read a declaration out of source", not two.
 */
function membersOf(src: string, openBraceIndex: number): string[] {
    const keys: string[] = [];
    let depth = 0;
    let i = openBraceIndex;
    let atStmtStart = false;
    while (i < src.length) {
        const two = src.slice(i, i + 2);
        if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
        if (two === '/*') { const end = src.indexOf('*/', i); i = end < 0 ? src.length : end + 2; continue; }
        const ch = src[i]!;
        if (ch === '"' || ch === "'" || ch === '`') {
            const quote = ch;
            i++;
            while (i < src.length && src[i] !== quote) { if (src[i] === '\\') i++; i++; }
            i++;
            continue;
        }
        if (ch === '{' || ch === '[' || ch === '(') {
            depth++;
            if (depth === 1) atStmtStart = true;
            i++;
            continue;
        }
        if (ch === '}' || ch === ']' || ch === ')') {
            depth--;
            if (depth === 0) break;
            i++;
            continue;
        }
        if (depth === 1) {
            // `,` for an object literal, `;` for an interface body.
            if (ch === ',' || ch === ';') { atStmtStart = true; i++; continue; }
            if (/\s/.test(ch)) { i++; continue; }
            if (atStmtStart) {
                const m = /^([A-Za-z_$][\w$]*)\??\s*:/.exec(src.slice(i));
                if (m) { keys.push(m[1]!); i += m[0].length; atStmtStart = false; continue; }
                atStmtStart = false;
            }
        }
        i++;
    }
    if (depth !== 0) throw new Error('unbalanced block — the extractor lost sync');
    return keys;
}

function declarationMembers(relPath: string, anchor: string): string[] {
    const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
    const at = src.indexOf(anchor);
    if (at < 0) {
        throw new Error(
            `anchor not found in ${relPath}: ${JSON.stringify(anchor)} — the declaration moved or ` +
            `was renamed. Do NOT relax this test; re-point the anchor and re-read the members.`,
        );
    }
    const brace = src.indexOf('{', at);
    if (brace < 0) throw new Error(`no block after anchor in ${relPath}`);
    return membersOf(src, brace);
}

const schemaKeys = () => declarationMembers(SCHEMA_FILE, 'export const OpeningSchema = z.object(');
const ifaceKeys  = () => declarationMembers(TYPES_FILE,  'export interface Opening {');

describe('OpeningSchema ⟷ interface Opening — the header claim is measured', () => {

    it('the extractors find a non-trivial declaration on both sides', () => {
        // A parity assertion between two EMPTY lists passes vacuously. This is the guard
        // that makes the next two assertions mean something.
        expect(schemaKeys().length).toBeGreaterThanOrEqual(9);
        expect(ifaceKeys().length).toBeGreaterThanOrEqual(9);
    });

    it('every interface member is validated by the schema (no silent narrowing)', () => {
        const missing = ifaceKeys().filter(k => !schemaKeys().includes(k));
        expect(
            missing,
            `interface Opening declares ${missing.join(', ')} and OpeningSchema does not. ` +
            'A member the schema does not know is a field the store gate cannot see — ' +
            'C84 EI-2 (no silent narrowing). Add it to OpeningSchema, do not relax this test.',
        ).toEqual([]);
    });

    it('every schema key exists on the interface (no field TypeScript cannot see)', () => {
        const extra = schemaKeys().filter(k => !ifaceKeys().includes(k));
        expect(
            extra,
            `OpeningSchema validates ${extra.join(', ')} and interface Opening does not declare ` +
            'it. A key only the schema knows is a field no caller can set in typed code. ' +
            'Add it to WallTypes.ts, do not relax this test.',
        ).toEqual([]);
    });

    // ⭐ The specific false report that prompted this file, pinned by name. If either of
    // these ever goes red the fields really were removed, and the two parity assertions
    // above would already have said so — this one says WHICH, in the words the report used.
    it('doorType and windowType ARE in the schema — the 2026-08-19 report was wrong', () => {
        expect(schemaKeys()).toContain('doorType');
        expect(schemaKeys()).toContain('windowType');
    });

    // §OPENING-PROFILE (L-1200) — the void-shape axis landed on the interface (lane
    // ROUND1) and on the schema (RAKE1, who holds `WallDataSchema.ts`). Pinned by name
    // because a field added on one side only is precisely what the parity checks above
    // exist to catch, and because this is the first member to arrive after they existed.
    it('openingProfile is on BOTH sides (L-1200)', () => {
        expect(ifaceKeys()).toContain('openingProfile');
        expect(schemaKeys()).toContain('openingProfile');
    });
});
