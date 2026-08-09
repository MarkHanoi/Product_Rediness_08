/**
 * @file server/__tests__/server-js-parses.test.ts
 *
 * §GATE-SERVER-JS-PARSES — every server-side .js module must actually PARSE.
 *
 * ⚠ This gate exists because a syntax error reached production and took the
 * site down (L-782). `server/dbMigrate.js` holds its schema in a template
 * literal; a comment inside that literal used BACKTICKS around
 * `checkout.session.completed`, which terminated the string early and left the
 * rest of the SQL to be parsed as JavaScript. Node refused the module, the
 * process exited 1, and the machine crash-looped to its restart cap.
 *
 * Nothing in the toolchain caught it, and each miss was structural rather than
 * bad luck:
 *   · `tsc` never sees it — the server half is plain .js and is not typechecked.
 *   · The server suite imports the modules it TESTS; `dbMigrate.js` is imported
 *     only by the boot path, so 484 passing tests said nothing about it.
 *   · The Fly image boot-smoke job — the one check that would have caught this —
 *     is `skipped` in CI, so it has never actually guarded a deploy.
 *   · The CI gate was bypassed, which is a decision, not an accident. But the
 *     bypass only removed a gate that would ALSO not have caught it.
 *
 * The lesson is the cheap one: a module that only the boot path imports is a
 * module nothing verifies. Parsing every server .js is a few hundred
 * milliseconds and closes the whole class.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SERVER_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(SERVER_DIR, '..');

/** Every .js under server/, plus the root BFF entry point. */
function collectServerJs(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '__tests__') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) collectServerJs(full, out);
        else if (entry.endsWith('.js')) out.push(full);
    }
    return out;
}

const FILES = [...collectServerJs(SERVER_DIR), join(REPO_ROOT, 'server.js')];

describe('§GATE-SERVER-JS-PARSES', () => {
    it('finds server modules to check (the gate is not vacuously passing)', () => {
        // ⚠ A collector that silently returns [] would make every assertion below
        // pass while checking nothing — the L-774 failure mode, where a 25-gate
        // suite reported success because the runner itself was broken.
        expect(FILES.length).toBeGreaterThan(5);
        expect(FILES.some((f) => f.endsWith('dbMigrate.js'))).toBe(true);
        expect(FILES.some((f) => f.endsWith('server.js'))).toBe(true);
    });

    for (const file of FILES) {
        const rel = file.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
        it(`parses: ${rel}`, () => {
            // `node --check` is the SAME parser that runs in production, so this
            // cannot disagree with the runtime the way a third-party parser could.
            expect(() =>
                execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }),
            ).not.toThrow();
        });
    }

    it('POSITIVE CONTROL — a backtick inside a template literal IS a parse error', () => {
        // Reproduces L-782 exactly: the defect was invisible to review because the
        // offending line reads as an ordinary SQL comment. Proving the checker
        // rejects it is what makes the assertions above meaningful.
        const broken = 'const SQL = `\n-- `oops` breaks the literal\n`;\n';
        expect(() =>
            execFileSync(process.execPath, ['--check', '-'], { input: broken, stdio: 'pipe' }),
        ).toThrow();

        const sound = "const SQL = `\n-- 'oops' is fine\n`;\n";
        expect(() =>
            execFileSync(process.execPath, ['--check', '-'], { input: sound, stdio: 'pipe' }),
        ).not.toThrow();
    });
});
