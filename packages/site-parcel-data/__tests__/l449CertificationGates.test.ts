// §L449-SIGNATURE-TOTALITY (L-677) — "certified with no signature" must be impossible to
// REINTRODUCE, not merely fixed once.
//
// THE DEFECT THESE ASSERTIONS EXIST FOR
// ------------------------------------
// `MADRID_NZ1_CERTIFIED = true` authorised the only Madrid envelope that rendered — 11.695 % of the
// city's Norma-Zonal-governed land — while Madrid's `sources/VERIFICATION.md §3 "Signed off (legal)"`
// was EMPTY. The docstring credited "the L-608 sign-off, 2026-07-25"; `git log -S` shows the flip in
// commit `3e571724`, `Co-Authored-By: Claude Opus 4.8`, a commit about a COEF_Z parse. The gate cited
// the commit that opened it, and the signatory was a machine.
//
// WHY THE OLD GUARD COULD NOT SEE IT — and why these tests scan differently:
// `envelopeAuthorisation.test.ts §TOTALITY` scans `src/rulepacks/` for `*_ENVELOPE_VERIFIED`. This
// gate is named `*_CERTIFIED` and lives in `src/providers/`. It was invisible on BOTH axes. So the
// scan below walks `src/**` recursively and matches BOTH conventions — the smallest change that makes
// the guard total over the thing it claims to be total over.
//
// ⚠ §DEREFERENCE-THE-CITATION. Registering a signature reference is not enough: the citation is
// OPENED and the anchor must be present in the named document. An unchecked citation is exactly how
// Madrid's gate carried an authority that did not exist.
//
// Authority: L-449 (the human-verification gate), C58 §1.4/§1.13, C63 §1.6, L-665, L-677.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    L449_CERTIFICATION_GATES,
    UNSIGNED_OPEN_GATES,
    isGateSignatureRecorded,
} from '../src/l449CertificationGates.js';
import { MADRID_NZ1_CERTIFIED } from '../src/providers/resolveMadridNZ1Ring.js';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Every exported L-449 gate constant name declared anywhere under `src/`, read from disk. */
function scanDeclaredGates(): Set<string> {
    const declared = new Set<string>();
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) {
                walk(p);
                continue;
            }
            if (!entry.endsWith('.ts')) continue;
            const src = readFileSync(p, 'utf8');
            // Both naming conventions, deliberately. `*_CERTIFIED` is the one the old guard missed.
            for (const m of src.matchAll(
                /export const ([A-Z0-9_]*(?:_CERTIFIED|_ENVELOPE_VERIFIED))\b/g,
            )) {
                declared.add(m[1]!);
            }
        }
    };
    walk(SRC_DIR);
    return declared;
}

describe('§TOTALITY — every L-449 gate in the package is registered', () => {
    it('scans BOTH `*_CERTIFIED` and `*_ENVELOPE_VERIFIED`, in EVERY src/ directory', () => {
        const declared = scanDeclaredGates();
        // Sanity: a broken regex must not pass vacuously.
        expect(declared.size).toBeGreaterThanOrEqual(12);
        // The four that prove the scan reaches past the old guard's blind spots: a `*_CERTIFIED`
        // name, and `src/providers/` as well as `src/rulepacks/`.
        expect(declared).toContain('MADRID_NZ1_CERTIFIED');
        expect(declared).toContain('NL_BESTEMMINGSPLAN_CERTIFIED');
        expect(declared).toContain('BCN_REFOS_OV_CERTIFIED');
        expect(declared).toContain('MADRID_ENVELOPE_VERIFIED');

        const registered = new Set(L449_CERTIFICATION_GATES.map((g) => g.gate));
        const missing = [...declared].filter((d) => !registered.has(d)).sort();
        expect(
            missing,
            `${missing.length} L-449 gate constant(s) exist on disk but are NOT registered in `
                + 'L449_CERTIFICATION_GATES. An unregistered gate is one nothing can audit — exactly '
                + 'what MADRID_NZ1_CERTIFIED was. Register it in src/l449CertificationGates.ts.',
        ).toEqual([]);

        const phantom = [...registered].filter((r) => !declared.has(r)).sort();
        expect(phantom, 'registry names a gate that no longer exists on disk').toEqual([]);
    });

    it('the registry READS the gate constants — it never restates them as literals', () => {
        // A second hand-written boolean could drift from the one the dispatcher checks (the
        // L-422/457/467/469 family, restated at the signature seam).
        const src = readFileSync(join(SRC_DIR, 'l449CertificationGates.ts'), 'utf8');
        const table = src.slice(
            src.indexOf('export const L449_CERTIFICATION_GATES'),
            src.indexOf('export const UNSIGNED_OPEN_GATES'),
        );
        expect(table.length).toBeGreaterThan(500);
        expect(table).not.toMatch(/value:\s*(true|false)\b/);
    });
});

describe('§DEREFERENCE-THE-CITATION — a claimed signature must actually exist', () => {
    it('every registered signature document EXISTS and CONTAINS its anchor', () => {
        const signed = L449_CERTIFICATION_GATES.filter((g) => g.signature !== null);
        expect(signed.length).toBeGreaterThan(0);
        for (const g of signed) {
            const sig = g.signature!;
            const abs = join(REPO_ROOT, sig.doc);
            expect(existsSync(abs), `${g.gate}: signature doc missing — ${sig.doc}`).toBe(true);
            expect(
                readFileSync(abs, 'utf8'),
                `${g.gate}: "${sig.anchor}" is NOT in ${sig.doc}. The gate cites a signature that `
                    + 'does not exist — the Madrid defect verbatim.',
            ).toContain(sig.anchor);
        }
    });

    it('every registered gate names a declaring FILE that exists', () => {
        for (const g of L449_CERTIFICATION_GATES) {
            expect(existsSync(join(REPO_ROOT, g.file)), `${g.gate}: ${g.file}`).toBe(true);
        }
    });
});

describe('§NO-UNSIGNED-OPEN-GATE — the reintroduction guard', () => {
    it('the set of OPEN gates with NO signature is EXACTLY the frozen quarantine list', () => {
        const openUnsigned = L449_CERTIFICATION_GATES
            .filter((g) => g.value === true && g.signature === null)
            .map((g) => g.gate)
            .sort();
        expect(
            openUnsigned,
            'A gate is OPEN (publishing numbers) with NO recorded human signature. Either record the '
                + 'signature in the city\'s sources/VERIFICATION.md and register it, or shut the gate. '
                + 'Adding it to UNSIGNED_OPEN_GATES is NOT the fix — that list is a dated quarantine of '
                + 'pre-existing debt (L-677), and growing it silently is the defect it exists to catch.',
        ).toEqual([...UNSIGNED_OPEN_GATES].sort());
    });

    it('MADRID_NZ1_CERTIFIED is OPEN on a DEREFERENCEABLE signature, not on a commit', () => {
        // §MADRID-NZ1-DECERTIFIED's regression pin, now pointing at the SIGNED state (SIG-M2,
        // 2026-08-02, Doctrine B / ADR-0283).
        //
        // ⚠ THE VALUE IS THE SAME `true` THE MACHINE SET, AND THAT IS EXACTLY WHY THIS TEST CANNOT
        // BE THE ONE THAT MATTERS. A boolean cannot tell a signature from a self-attribution. What
        // distinguishes them is that `§DEREFERENCE-THE-CITATION` above OPENS
        // `sources/VERIFICATION.md` and fails if the SIG-M2 anchor is not in it — so deleting the
        // signature turns this gate red, which is precisely what did NOT happen in July.
        expect(MADRID_NZ1_CERTIFIED).toBe(true);
        expect(UNSIGNED_OPEN_GATES).not.toContain('MADRID_NZ1_CERTIFIED');
        expect(isGateSignatureRecorded('MADRID_NZ1_CERTIFIED')).toBe(true);
    });

    it('`isGateSignatureRecorded` distinguishes signed-open from open-unsigned from shut', () => {
        expect(isGateSignatureRecorded('MURCIA_ENVELOPE_VERIFIED')).toBe(true);   // open + SIG-MU1
        // §PARIS-SIGN-OFF (2026-09-02): was the open-unsigned exemplar (→ false); the founder signed
        // the three assertions and the registry row carries the seat, so signed-open → true.
        expect(isGateSignatureRecorded('FR_PARIS_PLU_CERTIFIED')).toBe(true);     // open + §PARIS-SIGN-OFF
        expect(isGateSignatureRecorded('PT_PORTO_PDM_CERTIFIED')).toBe(false);    // SHUT (born shut, signature null)
        expect(isGateSignatureRecorded('CORDOBA_ENVELOPE_VERIFIED')).toBe(true);  // open + SIG-1, signed 2026-08-03
        expect(isGateSignatureRecorded('NOT_A_GATE')).toBe(false);                // unknown
    });
});
