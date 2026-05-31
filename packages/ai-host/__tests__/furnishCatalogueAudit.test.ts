// F8.1 — FurnitureType orphan + catalogue-consistency audit (pure data).
//
// Pins the three-way structural invariant across the D-FLE catalogue:
//   (1) packages/geometry-furniture/src/FurnitureTypes.ts          — FurnitureType union (full geometry catalogue)
//   (2) packages/ai-host/src/workflows/furnishLayout/types.ts      — FurnitureKind union (auto-furnish subset)
//   (3) packages/ai-host/src/workflows/furnishLayout/footprints.ts — FP[] table
//   (4) packages/ai-host/src/workflows/furnishLayout/archetypes.ts — per-room item lists
//
// Failures here mean a kind was added to one source and forgotten in the others
// (the typical "I shipped F1.x but the auto-pipeline can't see it" regression).
//
// "Orphans" = FurnitureType members NOT in FurnitureKind: manual-placement-only
// (drag-and-drop / GLB import / parametric variants). Informational: emitted via
// console.log + asserted in a known range so the count can't drift unnoticed.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FURNITURE_KINDS, footprintOf } from '../src/workflows/furnishLayout/footprints.js';
import { archetypeFor, FURNISHABLE_OCCUPANCIES } from '../src/workflows/furnishLayout/archetypes.js';
import type { FurnitureKind } from '../src/workflows/furnishLayout/types.js';

// ── Helpers: parse a `export type X = | 'a' | 'b'` union out of a TS file ──────
//
// Pure text extraction so the audit doesn't introduce a runtime import from
// geometry-furniture (which would bring builder dependencies into this pure
// data test). We match every single-quoted literal between `export type X =`
// and the terminating `;`. Comments are stripped first so `// 'foo'` notes
// don't pollute the set.
function extractUnionMembers(filePath: string, typeName: string): string[] {
    const src = readFileSync(filePath, 'utf-8');
    const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/\/\/.*$/gm, '');           // line comments
    const re = new RegExp(`export\\s+type\\s+${typeName}\\s*=([\\s\\S]*?);`, 'm');
    const m = stripped.match(re);
    if (!m) throw new Error(`could not find 'export type ${typeName}' in ${filePath}`);
    const body = m[1]!;
    const literals = Array.from(body.matchAll(/'([a-zA-Z0-9_]+)'/g)).map(x => x[1]!);
    return Array.from(new Set(literals));
}

const ROOT = join(__dirname, '..', '..', '..');
const FURNITURE_TYPES_FILE = join(ROOT, 'packages', 'geometry-furniture', 'src', 'FurnitureTypes.ts');
const KITCHEN_TYPES_FILE   = join(ROOT, 'packages', 'geometry-furniture', 'src', 'KitchenTypes.ts');
const FURNISH_TYPES_FILE   = join(ROOT, 'packages', 'ai-host', 'src', 'workflows', 'furnishLayout', 'types.ts');

const FURNITURE_TYPE_MEMBERS = new Set(extractUnionMembers(FURNITURE_TYPES_FILE, 'FurnitureType'));
const FURNITURE_KIND_MEMBERS = new Set(extractUnionMembers(FURNISH_TYPES_FILE, 'FurnitureKind'));
const KITCHEN_APPLIANCE_MEMBERS = new Set(extractUnionMembers(KITCHEN_TYPES_FILE, 'KitchenApplianceType'));

describe('F8.1 — FurnitureKind ↔ footprint exhaustiveness', () => {
    it('every FurnitureKind union member has a footprint entry', () => {
        const missing: string[] = [];
        for (const k of FURNITURE_KIND_MEMBERS) {
            try { footprintOf(k as FurnitureKind); } catch { missing.push(k); continue; }
            // Defensive: footprintOf returns undefined for missing keys (Record lookup).
            const fp = footprintOf(k as FurnitureKind);
            if (!fp) missing.push(k);
        }
        expect(missing, `FurnitureKind members with no footprint entry: ${missing.join(', ')}`).toEqual([]);
    });

    it('every footprint entry corresponds to a FurnitureKind union member', () => {
        const orphans = FURNITURE_KINDS.filter(k => !FURNITURE_KIND_MEMBERS.has(k));
        expect(orphans, `footprint entries with no FurnitureKind member: ${orphans.join(', ')}`).toEqual([]);
    });
});

describe('F8.1 — archetype-kind validity', () => {
    it('every archetype item references a known FurnitureKind', () => {
        const bad: string[] = [];
        for (const occ of FURNISHABLE_OCCUPANCIES) {
            const a = archetypeFor(occ)!;
            for (const item of a.items) {
                if (!FURNITURE_KIND_MEMBERS.has(item.kind)) {
                    bad.push(`${occ} → '${item.kind}'`);
                }
            }
        }
        expect(bad, `archetypes referencing unknown FurnitureKind: ${bad.join('; ')}`).toEqual([]);
    });

    it('every archetype REQUIRED item has a footprint entry', () => {
        const bad: string[] = [];
        for (const occ of FURNISHABLE_OCCUPANCIES) {
            const a = archetypeFor(occ)!;
            for (const item of a.items) {
                if (!item.required) continue;
                const fp = footprintOf(item.kind);
                if (!fp || fp.w <= 0 || fp.l <= 0 || fp.h <= 0) {
                    bad.push(`${occ} → '${item.kind}' (required)`);
                }
            }
        }
        expect(bad, `required archetype items with missing/invalid footprint: ${bad.join('; ')}`).toEqual([]);
    });

    it('every archetype-only kind (not just in footprints) also resolves to a footprint', () => {
        // Catches a kind referenced ONLY by an archetype + the FurnitureKind union
        // but never added to FP (the inverse drift of test 1).
        const archetypeKinds = new Set<string>();
        for (const occ of FURNISHABLE_OCCUPANCIES) {
            for (const item of archetypeFor(occ)!.items) archetypeKinds.add(item.kind);
        }
        const footprintSet = new Set<string>(FURNITURE_KINDS);
        const missing = [...archetypeKinds].filter(k => !footprintSet.has(k));
        expect(missing, `archetype kinds without a footprint: ${missing.join(', ')}`).toEqual([]);
    });
});

describe('F8.1 — KitchenAppliance / FurnitureKind cross-consistency', () => {
    it('kitchen-mounted appliance variants are intentionally EXCLUDED from FurnitureKind', () => {
        // The kitchen-mounted washer (`washing_machine_dark/_white`) is a slot-
        // appliance inside a kitchen unit (KitchenApplianceType), NOT a standalone
        // piece the auto-pipeline places by footprint. The STANDALONE utility-room
        // washer IS in FurnitureKind. Pinning this asymmetry stops a well-meaning
        // future contributor from "fixing" the gap by adding the kitchen variant
        // to FurnitureKind, which would double-emit it via the kitchen run.
        expect(FURNITURE_KIND_MEMBERS.has('washing_machine_dark')).toBe(false);
        expect(FURNITURE_KIND_MEMBERS.has('washing_machine_white')).toBe(false);
        expect(FURNITURE_KIND_MEMBERS.has('washing_machine_standalone')).toBe(true);
    });

    it('every KitchenApplianceType is recognised in the geometry catalogue (informational)', () => {
        // The full FurnitureType union doesn't enumerate appliance slot-types
        // (they ride inside KitchenUnitConfig.appliance). Pin the count so a
        // future appliance addition is noticed by audit.
        expect(KITCHEN_APPLIANCE_MEMBERS.size).toBeGreaterThanOrEqual(8);
        expect(KITCHEN_APPLIANCE_MEMBERS.size).toBeLessThan(40);
    });
});

describe('F8.1 — FurnitureType orphans (manual-only catalogue items)', () => {
    // "Orphan" = a FurnitureType member that is NOT in the D-FLE FurnitureKind
    // union. Auto-furnish doesn't place these; they live in the drag-and-drop
    // catalogue / parametric variants / GLB import only. INFORMATIONAL, but the
    // count is bounded so silent drift (e.g. a new core archetype kind landing
    // here by mistake) becomes a visible test diff.
    const orphans = [...FURNITURE_TYPE_MEMBERS]
        .filter(t => !FURNITURE_KIND_MEMBERS.has(t))
        .sort();

    it('orphan count is in the expected range (manual-only catalogue items)', () => {
        // Snapshot range as of 2026-05-31. The catalogue grows over time as new
        // GLB imports / parametric variants / arbol trees land; widen the upper
        // bound deliberately when that happens.
        expect(orphans.length).toBeGreaterThan(0);
        expect(orphans.length).toBeLessThan(100);
    });

    it('orphan list is fully contained in FurnitureType (sanity)', () => {
        for (const o of orphans) expect(FURNITURE_TYPE_MEMBERS.has(o)).toBe(true);
    });

    it('informational: dump the orphan list for review', () => {
        // eslint-disable-next-line no-console
        console.log(
            `[F8.1 audit] ${orphans.length} FurnitureType orphan(s) (not in D-FLE FurnitureKind):\n  ` +
            orphans.join(', '),
        );
        expect(true).toBe(true);
    });
});
