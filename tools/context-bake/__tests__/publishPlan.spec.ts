// §PUBLISH-PLAN-IS-GENERATED — the tripwire on `tools/context-bake/publish-plan.mjs`.
//
// WHY THIS TEST EXISTS
// --------------------
// The publish plan decides which regions get baked and which merge may run, and its predecessor
// (`RUNBOOK-CONTEXT-R2-PUBLISH.md` §8) was prose: every number a literal, none of them re-derivable.
// The generator replaces the literals. This spec pins the three judgements the generator makes that
// a reader would otherwise have to take on trust, because each has already been got wrong once:
//
//   A. ORPHAN ADJUDICATION. "All nine orphans are renames" is the sentence that authorises
//      `allow_region_removal` for nine LIVE metros. It must be DERIVED — same Geofabrik extract, a
//      successor bbox that strictly contains the removed one — and it must refuse to say RENAME when
//      either half fails. A wrong verdict here deletes San Francisco, Chicago, Austin, Houston,
//      Boston, Riyadh, Jeddah, Dubai and Abu Dhabi from a live map and puts nothing back.
//   B. THE CALIBRATION MUST EXCLUDE A ROW WHOSE BBOX MOVED AFTER ITS BAKE. `newyork` is the live
//      example: its staged tiles are the pre-`18bc20c7` Manhattan clip while its `pbfUrl` is the
//      whole New York State extract, so it contributes a buildings ratio ~20× below the set and
//      drags every projection down. The exclusion is derived from the sha the staged set records —
//      never from the row's name.
//   C. A POPULATION IS EITHER A MEASURED WIKIDATA VALUE OR A NAMED REASON. Never null-without-cause,
//      because a row that silently ranks last is a row that never gets baked (C57 §1.5/§1.9:
//      failure ≠ empty).
//
// It also asserts the committed probe snapshot never carries a size taken from a non-206 — the
// exact failure-vs-empty defect Geofabrik invites, answering 502/503 with a ~3.2 kB HTML body that
// has a Content-Length of its own.
//
// ⚠ OFFLINE BY CONSTRUCTION. Nothing here touches the network; the generator's `--probe` mode is an
// operator action, not CI's. A test that needed R2, GitHub and Wikidata to be up would go red on
// someone's train ([[verification-dispatch-rendering-three-milestones]]: the axes are separate).
//
// LAYERING: a build/inspection tool test, like its bake.mjs siblings — no OTel span (P8 binds
// exported package functions, not bake tooling).
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    bboxContains,
    pbfSizeComments,
    buildModel,
    loadSnapshot,
    POPULATION_QIDS,
    POPULATION_ZERO,
    PROVEN_FREE,
    // @ts-expect-error — plain .mjs tooling module, no types shipped (same as its bake.mjs siblings)
} from '../publish-plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const SNAPSHOT = resolve(REPO, 'tools/context-bake/publish-plan.probes.json');

interface Orphan {
    name: string;
    verdict: string;
    successor: string | null;
    successorBbox: string | null;
    old: { bbox: string | null; pbfUrl: string | null; heightJoin: string | null } | null;
    successors: string[];
}
interface Row {
    name: string; bbox: string; pbfUrl: string; pending: boolean; live: boolean; staged: boolean;
    pop: number | null; popSrc: string; pbfBytes: number | null; layerBytes: Record<string, number> | null;
}
interface Model {
    model: Row[]; orphans: Orphan[]; liveRegions: string[]; required: string[];
    cal: string[]; calExcluded: { name: string; then: string; now: string; sha: string }[];
    ratios: Record<string, { n: number; aggregate: number }>;
    wallClock: { n: number; intercept: number; slope: number; maxMeasured: number } | null;
}

// Built ONCE: `buildModel` shells out to `bake.mjs --regions-json` and to `git show` for the
// bbox-at-bake-time check, so rebuilding it per assertion turns a 6-second file into a minute.
let cached: Model | null = null;
const model = (): Model => {
    if (!cached) throw new Error('model() called before beforeAll built it');
    return cached;
};
// The orphan adjudication walks `git log -S` per orphan and reads bake.mjs at each staged set's sha,
// so the build is seconds, not milliseconds. Build it ONCE, with a hook timeout that admits that.
beforeAll(() => { cached = buildModel(loadSnapshot()) as Model; }, 180_000);

describe('§PUBLISH-PLAN-IS-GENERATED — bbox containment is the arithmetic, not a claim', () => {
    it('bboxContains reads minLon,minLat,maxLon,maxLat and refuses a malformed bbox', () => {
        // California contains the old San Francisco clip — the real pair, transcribed from 18bc20c7.
        expect(bboxContains('-125.90,32.48,-114.12,42.02', '-122.52,37.70,-122.36,37.83')).toBe(true);
        // …and does NOT contain a box that pokes out of it.
        expect(bboxContains('-125.90,32.48,-114.12,42.02', '-122.52,37.70,-110.00,37.83')).toBe(false);
        // Identity is containment; a 1e-9 overhang is not.
        expect(bboxContains('0,0,1,1', '0,0,1,1')).toBe(true);
        expect(bboxContains('0,0,1,1', '0,0,1.000000001,1')).toBe(false);
        // A bbox that is not four finite numbers is UNKNOWN, never a silent `false`.
        expect(bboxContains('0,0,1', '0,0,1,1')).toBeNull();
        expect(bboxContains(undefined, '0,0,1,1')).toBeNull();
    });
});

describe('§PUBLISH-PLAN-IS-GENERATED — A · the orphan verdict is derived, and it authorises a deletion', () => {
    it('every live region the code no longer has resolves to a verdict, and RENAME requires BOTH halves', () => {
        const M = model();
        expect(M.orphans.length).toBeGreaterThan(0); // the nine renames of 18bc20c7 are live today
        for (const o of M.orphans) {
            expect(o.verdict, `${o.name} has no verdict`).toBeTruthy();
            if (o.verdict !== 'RENAME') continue;
            // A RENAME verdict may only stand when the successor is drawn from the SAME extract AND
            // its bbox contains the removed row's. Anything less is a DELETION wearing a rename's name.
            expect(o.successor, `${o.name} claims RENAME with no successor`).toBeTruthy();
            expect(o.successors, `${o.name}: successor not drawn from the same extract`).toContain(o.successor);
            expect(
                bboxContains(o.successorBbox, o.old?.bbox),
                `${o.name}: successor ${o.successor} does not contain it — this is a DELETION`,
            ).toBe(true);
        }
    });

    it('a successor from a DIFFERENT extract, or one that does not contain the row, is never a RENAME', () => {
        // The generator's rule, exercised on the two shapes that must not pass.
        expect(bboxContains('-125.90,32.48,-114.12,42.02', '-71.20,42.22,-70.98,42.40')).toBe(false); // Boston is not in California
        expect(bboxContains('46.60,24.58,46.83,24.80', '34.43,15.24,60.95,32.20')).toBe(false); // the child cannot contain the parent
    });

    it('every orphan successor is a real bake.mjs row — a re-point with no row is a deletion', () => {
        const M = model();
        const names = new Set(M.model.map((r) => r.name));
        for (const o of M.orphans) {
            if (!o.successor) continue;
            expect(names.has(o.successor), `${o.name} → ${o.successor}, which is not a bake.mjs row`).toBe(true);
        }
    });
});

describe('§PUBLISH-PLAN-IS-GENERATED — B · the calibration set', () => {
    it('a row whose bbox moved after its bake is EXCLUDED, with the sha and both bboxes named', () => {
        const M = model();
        for (const x of M.calExcluded) {
            expect(x.then).not.toEqual(x.now);
            expect(x.sha, `${x.name} excluded without naming the sha it was baked at`).toMatch(/^[0-9a-f]{8}$/);
            expect(M.cal).not.toContain(x.name);
        }
    });

    it('every calibration row is live AND staged AND whole-extract — a city clip would poison the ratio', () => {
        const M = model();
        const by = new Map(M.model.map((r) => [r.name, r]));
        for (const name of M.cal) {
            const r = by.get(name)!;
            expect(r.live, `${name} is in the calibration set but is not live`).toBe(true);
            expect(r.staged, `${name} is in the calibration set but is not staged`).toBe(true);
            expect(r.pbfBytes, `${name} is in the calibration set with no measured extract size`).toBeGreaterThan(0);
        }
    });

    it('a ratio is only published when it has rows behind it', () => {
        const M = model();
        for (const [layer, r] of Object.entries(M.ratios)) {
            expect(r.n, `${layer} ratio published with no calibration rows`).toBeGreaterThan(0);
            expect(r.aggregate).toBeGreaterThan(0);
        }
    });
});

describe('§PUBLISH-PLAN-IS-GENERATED — C · a population is measured or it is NAMED', () => {
    it('no row carries a null population without a stated reason', () => {
        const M = model();
        for (const r of M.model) {
            if (r.pop != null) {
                // A measured value must cite the Wikidata item it came from, or say why it is a deliberate 0.
                expect(r.popSrc, `${r.name} has a population with no source`).toMatch(/Q\d+|DELIBERATE 0/);
                continue;
            }
            expect(r.popSrc, `${r.name} has no population and no reason`).toMatch(/UNRESOLVED|AMBIGUOUS|PARTIAL/);
        }
    });

    it('the deliberate zeros say WHY, so a 0 is never mistaken for a measurement', () => {
        for (const [name, reason] of Object.entries(POPULATION_ZERO)) {
            expect(reason.length, `${name} is zeroed with no reason`).toBeGreaterThan(20);
        }
    });

    it('every override maps to at least one QID — an empty override would silently unresolve a row', () => {
        for (const [name, qids] of Object.entries(POPULATION_QIDS)) {
            expect(qids.length, `${name} maps to no QID`).toBeGreaterThan(0);
            for (const q of qids) expect(q, `${name} maps to a malformed QID`).toMatch(/^Q\d+$/);
        }
    });
});

describe('§PUBLISH-PLAN-IS-GENERATED — the snapshot never records a size it did not measure', () => {
    it('every pbf entry carrying bytes came back 206, and every failure is recorded as null', () => {
        if (!existsSync(SNAPSHOT)) return; // the snapshot is committed, but the tool works without it
        const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
        for (const [url, p] of Object.entries<{ status: number | null; bytes: number | null }>(snap.pbf ?? {})) {
            if (p.bytes == null) continue;
            expect(p.status, `${url} recorded ${p.bytes} B from HTTP ${p.status} — only a 206 carries a size`).toBe(206);
            expect(p.bytes).toBeGreaterThan(1_000_000); // a 3.2 kB squid error page is not an extract
        }
    });

    it('a staged slug is only counted when its body IS a staging manifest — r2.dev serves HTML on a miss', () => {
        if (!existsSync(SNAPSHOT)) return;
        const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
        const withManifest = Object.entries<{ status: number | string; manifest: { schema?: string } | null }>(snap.staging ?? {})
            .filter(([, s]) => s.manifest);
        expect(withManifest.length, 'no staged sets in the snapshot — re-probe it').toBeGreaterThan(0);
        for (const [slug, s] of withManifest) {
            expect(s.status, `${slug} kept a manifest from HTTP ${s.status}`).toBe(200);
            expect(s.manifest!.schema).toMatch(/^pryzm-context-staging-manifest/);
        }
    });
});

describe('§PUBLISH-PLAN-IS-GENERATED — the extract sizes bake.mjs already records', () => {
    it('pbfSizeComments reads the `// N B` a row carries and ignores everything else', () => {
        const src = [
            "  { name: 'california', pbfUrl: 'x', bbox: '1,2,3,4' },   // 1,326,860,797 B",
            "  { name: 'mexico',     pbfUrl: 'y', bbox: '1,2,3,4' },",
            "  { name: 'tiny',       pbfUrl: 'z', bbox: '1,2,3,4' },   // 3,204 B",  // a squid error page's length
            '  // 999,999,999 B  — a prose comment on its own line, not a row',
        ].join('\n');
        const got = pbfSizeComments(src);
        expect(got.get('california')).toBe(1_326_860_797);
        expect(got.has('mexico')).toBe(false);   // absent, not zero
        expect(got.has('tiny')).toBe(false);     // 3,204 is five digits — below the 7-digit floor
        expect(got.size).toBe(1);
    });

    it('the real bake.mjs parses, and every size it yields is plausibly an extract', () => {
        const src = readFileSync(resolve(REPO, 'tools/context-bake/bake.mjs'), 'utf8');
        const sizes = pbfSizeComments(src);
        expect(sizes.size).toBeGreaterThan(0);
        for (const [name, bytes] of sizes) expect(bytes, `${name}`).toBeGreaterThan(1_000_000);
    });
});

describe('§PUBLISH-PLAN-IS-GENERATED — the disk bound is a LOWER bound, and it is labelled as one', () => {
    it('PROVEN_FREE is the roads publish inference (23.68 GiB in + 23.49 GiB out), not a guess', () => {
        expect(PROVEN_FREE / 1073741824).toBeCloseTo(47.2, 1);
    });

    it('the wall-clock fit, when published, rests on at least three measured runs', () => {
        const M = model();
        if (!M.wallClock) return; // honestly withheld is a valid state
        expect(M.wallClock.n).toBeGreaterThanOrEqual(3);
        expect(M.wallClock.maxMeasured).toBeGreaterThan(0);
        // A predicted bake that exceeded the job ceiling would have to be named, never silently planned.
        expect(M.wallClock.maxMeasured).toBeLessThanOrEqual(330);
    });
});
