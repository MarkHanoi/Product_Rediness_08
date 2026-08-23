/**
 * @file apps/editor/src/ui/property-panel/__tests__/hostedTypeDimensionEquivalence.spec.ts
 *
 * §FIX-WINDOW-TYPE-DIMS-DRIFT (L-10070) — lane LAYERMAT10, 2026-08-23.
 *
 * Founder: *"Please check the **window type creator** — it doesn't have all window
 * properties"*.
 *
 * He was right, and the drift is a SET question, not an opinion:
 *
 *   · window — model 15 fields, dialog offered 8. **ARM A = 7 missing**
 *     (sillHeight, sashThickness, sashDepth, glazingThickness, rebateDepth,
 *     sillThickness, sillOverhang). ARM B = 0.
 *   · door   — **both arms EMPTY.** Its declaration even says so in prose:
 *     *"Exactly the six `DoorSystemType.dimensions` fields — no more."*
 *
 * ⭐ WINDOW CARRIED NO SUCH SENTENCE, AND THAT IS EXACTLY WHERE IT DRIFTED. A prose
 * promise held for door and rotted for window, which is the same failure C03 §4.9
 * mints a rule for one table over: **when one table's membership is DERIVED from
 * another's, the relationship must be asserted by an ARTEFACT, in BOTH directions,
 * comparing SETS and never counts.** This is that artefact for the hosted-opening
 * type dialog.
 *
 * ⚠ WHY IT READS THE SOURCE. `WindowTypeDimensions` is a TypeScript interface and has
 * no runtime representation, so there is nothing to enumerate at run time. The field
 * names are parsed out of the declaring file — the same technique
 * `tools/ga-gate/check-layer-boundaries.ts` uses for the same reason. A test that
 * instead re-listed the expected names by hand would be a THIRD copy of the answer
 * and would rot in exactly the way the thing it is guarding just did.
 *
 * ⛔ WHAT THIS DOES **NOT** ASSERT: that the dialog can express everything a window
 * has. It cannot — `revealProjection` and the four `revealSplay*` angles the founder
 * named live on the window INSTANCE schema and are absent from the TYPE record
 * altogether (L-10071). This suite pins the TYPE tier against ITS OWN record.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { allElementTypeAuthoring } from '../ElementTypeAuthoringRegistry';

/**
 * Anchored on the vitest root (this suite is claimed by the REPO-ROOT
 * `vitest.config.ts`), and the existence check is not defensive padding: a path
 * that silently missed would make every arm below pass on an empty parse, which is
 * a green test standing in for a broken instrument.
 */
const REPO = (rel: string): string => {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) throw new Error(`[hostedTypeDimensionEquivalence] cannot read ${rel} (resolved ${p})`);
    return p;
};

/**
 * Pull the optional-scalar field names out of a `{ ... }` block, ignoring comments.
 * Deliberately narrow: `name?: number;` / `name: number;` and nothing else, because a
 * looser pattern would silently absorb nested objects and report a false equivalence.
 */
function scalarFieldsIn(source: string, blockStart: RegExp): string[] {
    const m = blockStart.exec(source);
    if (!m) throw new Error(`block not found: ${blockStart}`);
    const from = source.indexOf('{', m.index);
    let depth = 0, end = from;
    for (let i = from; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = source.slice(from + 1, end)
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/\/\/[^\n]*/g, '');        // line comments
    return [...body.matchAll(/^\s*(\w+)\??:\s*number\s*;/gm)].map(x => x[1]).sort();
}

const declaredKeys = (family: string): string[] => {
    const a = allElementTypeAuthoring().find(x => x.family === family);
    if (!a) throw new Error(`no authoring declaration for ${family}`);
    return (a.finishEditor?.dimensions ?? []).map(d => d.key).sort();
};

const CASES = [
    {
        family: 'window',
        file: 'packages/geometry-window/src/WindowSystemTypeStore.ts',
        block: /export interface WindowTypeDimensions\s*\{/,
    },
    {
        family: 'door',
        file: 'packages/geometry-door/src/DoorSystemTypeStore.ts',
        // Door declares its dimensions INLINE on the type rather than as a named
        // interface — asserted here as it is, not normalised into a shape that would
        // make the two families look more alike than they are.
        block: /dimensions\?:\s*\{/,
    },
] as const;

describe('L-10070 — the hosted type dialog offers exactly its record\'s dimensions', () => {

    for (const c of CASES) {
        const model = () => scalarFieldsIn(readFileSync(REPO(c.file), 'utf8'), c.block);

        it(`FAILS PRE-FIX (window): ARM A — ${c.family}: no record field is missing from the dialog`, () => {
            const offered = new Set(declaredKeys(c.family));
            const missing = model().filter(f => !offered.has(f));
            expect(
                missing,
                `${c.family}: these are properties of the TYPE — resolve*Dimensions() reads them ` +
                `when the instance carries none — and a catalogue author cannot state them. ` +
                `Add a row to finishEditor.dimensions in ElementTypeAuthoringRegistry.ts.`,
            ).toEqual([]);
        });

        it(`ARM B — ${c.family}: the dialog offers no row the record cannot hold`, () => {
            const known = new Set(model());
            const phantom = declaredKeys(c.family).filter(k => !known.has(k));
            expect(
                phantom,
                `${c.family}: the dialog would accept a value the type record cannot carry — ` +
                `worse than a missing control, because it reports success and stores nothing.`,
            ).toEqual([]);
        });
    }

    /**
     * The parser must actually find something. A regex that silently matched nothing
     * would make both arms above pass vacuously — the §fake-more-capable-than-real
     * shape, where a green test is evidence of a broken instrument.
     */
    it('the source parse is not vacuous', () => {
        for (const c of CASES) {
            const fields = scalarFieldsIn(readFileSync(REPO(c.file), 'utf8'), c.block);
            expect(fields.length, `${c.family}: parsed 0 fields — the instrument is broken`)
                .toBeGreaterThan(3);
        }
    });

    /**
     * ⭐ The founder's actual two fields, asserted ABSENT from the type record — so the
     * day someone adds them, this test fails and points at L-10071 rather than letting
     * the gap be rediscovered from a screenshot.
     */
    it('L-10071 — reveal projection/splay are still NOT on the window TYPE record', () => {
        const fields = scalarFieldsIn(
            readFileSync(REPO('packages/geometry-window/src/WindowSystemTypeStore.ts'), 'utf8'),
            /export interface WindowTypeDimensions\s*\{/,
        );
        const reveal = fields.filter(f => f.toLowerCase().startsWith('reveal'));
        expect(
            reveal,
            'A reveal field appeared on WindowTypeDimensions. That is the L-10071 work: ' +
            'add the matching rows to ElementTypeAuthoringRegistry (they become sayable in ' +
            'the panel chat automatically) and delete this assertion.',
        ).toEqual([]);
    });
});
