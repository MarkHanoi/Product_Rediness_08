/**
 * snapshotUrlScan.test.ts — §SCAN-SNAPSHOT-URLS (L-10042)
 *
 * Three things need pinning, and the third is the one that usually is not:
 *
 *   1. the scan CATCHES the bypasses it exists for;
 *   2. the scan does NOT flag ordinary BIM strings;
 *   3. the BOUND holds — depth and value budget both stop the walk, and a
 *      truncated scan says so, because `findings: []` on a scan that never
 *      finished is "not looked at", not "clean".
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    MAX_SCAN_DEPTH,
    MAX_SCAN_VALUES,
    classifyUrlValue,
    normaliseForSchemeMatch,
    scanSnapshotForUnsafeUrls,
    formatScanReport,
} from '../snapshotUrlScan.js';

const _here = dirname(fileURLToPath(import.meta.url));

describe('§SCAN-SNAPSHOT-URLS — what it catches', () => {
    it('flags javascript: and vbscript:', () => {
        expect(classifyUrlValue('javascript:alert(1)')?.kind).toBe('dangerous-scheme');
        expect(classifyUrlValue('VBScript:msgbox(1)')?.kind).toBe('dangerous-scheme');
    });

    it('⭐ strips C0 controls BEFORE matching, so the classic bypasses do not work', () => {
        // A naive startsWith('javascript:') misses both of these, and a browser
        // executes both.
        expect(classifyUrlValue('java\u0000script:alert(1)')?.kind).toBe('dangerous-scheme');
        expect(classifyUrlValue('java\tscript:alert(1)')?.kind).toBe('dangerous-scheme');
        expect(classifyUrlValue('java\nscript:alert(1)')?.kind).toBe('dangerous-scheme');
        expect(classifyUrlValue('\u0000\u0000javascript:alert(1)')?.kind).toBe('dangerous-scheme');
        expect(normaliseForSchemeMatch('java\u0000\tscript:x')).toBe('javascript:x');
    });

    it('flags a real data: URI (a script carrier) but NOT the word "Data:" in prose', () => {
        expect(classifyUrlValue('data:text/html;base64,PHNjcmlwdD4=')?.kind).toBe('dangerous-scheme');
        expect(classifyUrlValue('data:image/svg+xml,<svg onload=alert(1)>')?.kind).toBe('dangerous-scheme');
        // ⭐ The false positive this rule was written to avoid.
        expect(classifyUrlValue('Data: 12 mm')).toBeNull();
        expect(classifyUrlValue('Datum: level 2')).toBeNull();
    });

    it('flags SSRF-shaped hosts, including the cloud metadata endpoint', () => {
        expect(classifyUrlValue('http://169.254.169.254/latest/meta-data/')?.kind).toBe('private-host');
        expect(classifyUrlValue('http://localhost:5000/api/projects')?.kind).toBe('private-host');
        expect(classifyUrlValue('https://127.0.0.1/')?.kind).toBe('private-host');
        expect(classifyUrlValue('http://10.1.2.3/x')?.kind).toBe('private-host');
        expect(classifyUrlValue('http://192.168.0.1/x')?.kind).toBe('private-host');
        expect(classifyUrlValue('http://172.16.5.5/x')?.kind).toBe('private-host');
        expect(classifyUrlValue('http://db.internal/x')?.kind).toBe('private-host');
    });

    it('flags a scheme-relative URL, whose scheme is decided by the consumer', () => {
        expect(classifyUrlValue('//evil.example.com/model.glb')?.kind).toBe('scheme-relative');
    });

    it('reports a hostile OBJECT KEY, not only a value — keys are persisted too', () => {
        const scan = scanSnapshotForUnsafeUrls({ 'javascript:alert(1)': 'harmless' });
        expect(scan.findings.some(f => f.kind === 'dangerous-scheme')).toBe(true);
    });

    it('names the JSON path of a finding, so the report points somewhere', () => {
        const scan = scanSnapshotForUnsafeUrls({
            walls: [{ id: 'w1' }, { id: 'w2', finishes: { texture: 'javascript:alert(1)' } }],
        });
        expect(scan.findings).toHaveLength(1);
        expect(scan.findings[0].path).toBe('$.walls.1.finishes.texture');
    });
});

describe('§SCAN-SNAPSHOT-URLS — what it must NOT flag (a false 400 is worse than the hole)', () => {
    const legitimate = [
        'https://cdn.pryzm.app/textures/oak-parquet.jpg',
        'https://storage.googleapis.com/pryzm/models/chair.glb',
        'http://example.com/tex.png',
        'Wall Type A: 200mm concrete',
        'W-01',
        '2O2Fr$t4X7Zf8NOew3FLOH',
        'wall-basic-200',
        'Level 1: Ground Floor',
        '#6600FF',
        'paint-white',
        '2026-08-23T10:00:00.000Z',
        'C:/Users/architect/models/house.ifc',
        'ratio 1:100',
    ];
    for (const value of legitimate) {
        it(`accepts ${JSON.stringify(value)}`, () => {
            expect(classifyUrlValue(value)).toBeNull();
        });
    }

    it('a realistic wall-and-furniture snapshot produces zero findings', () => {
        const snapshot = {
            projectName: 'House', schemaVersion: 2,
            walls: Array.from({ length: 200 }, (_, i) => ({
                id: `w${i}`, start: { x: i, y: 0, z: 0 }, end: { x: i + 3, y: 0, z: 0 },
                height: 3, thickness: 0.2, systemTypeId: 'wall-basic-200', mark: `W${i}`,
            })),
            furniture: Array.from({ length: 50 }, (_, i) => ({
                id: `f${i}`, furnitureType: 'chair',
                assetUrl: 'https://cdn.pryzm.app/glb/chair.glb',
            })),
        };
        expect(scanSnapshotForUnsafeUrls(snapshot).findings).toHaveLength(0);
    });
});

describe('§SCAN-SNAPSHOT-URLS — the BOUND, which is the whole point of the word "bounded"', () => {
    it('stops at MAX_SCAN_VALUES and reports truncatedBy: values', () => {
        const wide = { a: Array.from({ length: 400 }, (_, i) => `id-${i}`) };
        const scan = scanSnapshotForUnsafeUrls(wide, { maxValues: 100 });
        expect(scan.valuesVisited).toBeLessThanOrEqual(100);
        expect(scan.truncated).toBe(true);
        expect(scan.truncatedBy).toBe('values');
    });

    it('⛔ stops at MAX_SCAN_DEPTH on a deep nest instead of throwing a RangeError', () => {
        // A recursive walk here throws PAST the route handler, turning the 400 the
        // caller is owed into a 500. 20 000 levels deep is trivial to post.
        let root: Record<string, unknown> = {};
        let cursor = root;
        for (let i = 0; i < 20_000; i++) { cursor.n = {}; cursor = cursor.n as Record<string, unknown>; }
        cursor.bad = 'javascript:alert(1)';

        let scan!: ReturnType<typeof scanSnapshotForUnsafeUrls>;
        expect(() => { scan = scanSnapshotForUnsafeUrls(root); }).not.toThrow();
        expect(scan.truncated).toBe(true);
        expect(scan.truncatedBy).toBe('depth');
        expect(scan.maxDepthSeen).toBeLessThanOrEqual(MAX_SCAN_DEPTH);
        // ⭐ AND the finding beyond the bound is NOT reported — which is exactly
        // why a truncated scan is a sample and not a proof, and why this ships
        // report-only.
        expect(scan.findings).toHaveLength(0);
    });

    it('the report line SAYS it is report-only and SAYS whether it was truncated', () => {
        const scan = scanSnapshotForUnsafeUrls({ t: 'javascript:alert(1)' });
        const line = formatScanReport(scan, { projectId: 'p1', versionId: 'v1', bytes: 123 });
        expect(line).not.toBeNull();
        const parsed = JSON.parse(line as string);
        expect(parsed.mode).toMatch(/REPORT-ONLY/);
        expect(parsed.wouldReject).toBe(true);
        expect(parsed.truncated).toBe(false);
        expect(parsed.findingCount).toBe(1);
    });

    it('returns null for a clean, complete scan — no log line for the normal case', () => {
        expect(formatScanReport(scanSnapshotForUnsafeUrls({ a: 'W-01' }), { projectId: 'p' })).toBeNull();
    });

    it('the declared bounds are the measured ones', () => {
        expect(MAX_SCAN_DEPTH).toBe(48);
        expect(MAX_SCAN_VALUES).toBe(500_000);
    });

    it('a hostile value cannot inflate the log line beyond 120 chars', () => {
        const scan = scanSnapshotForUnsafeUrls({ t: `javascript:${'A'.repeat(50_000)}` });
        expect(scan.findings[0].sample.length).toBeLessThanOrEqual(120);
    });

    it('never throws on cyclic or exotic input', () => {
        const cyclic: Record<string, unknown> = { a: 1 };
        cyclic.self = cyclic;
        expect(() => scanSnapshotForUnsafeUrls(cyclic)).not.toThrow();
        expect(() => scanSnapshotForUnsafeUrls(null)).not.toThrow();
        expect(() => scanSnapshotForUnsafeUrls(undefined)).not.toThrow();
        expect(() => scanSnapshotForUnsafeUrls(42)).not.toThrow();
    });
});

describe('§SCAN-SNAPSHOT-URLS — wired into the route, and wired REPORT-ONLY', () => {
    const serverJs = readFileSync(resolve(_here, '../../server.js'), 'utf8');
    const routeStart = serverJs.indexOf("app.post('/api/projects/:id/versions'");
    const routeEnd = serverJs.indexOf("app.get('/api/projects/:id/command-log'", routeStart);
    const route = serverJs.slice(routeStart, routeEnd);

    it('the versions POST route runs the scan', () => {
        expect(serverJs).toMatch(/from\s+'\.\/server\/snapshotUrlScan\.js'/);
        expect(route).toContain('scanSnapshotForUnsafeUrls(snapshot)');
    });

    it('⛔ the scan REJECTS NOTHING — no status is returned from its block', () => {
        const scanAt = route.indexOf('scanSnapshotForUnsafeUrls(snapshot)');
        expect(scanAt).toBeGreaterThan(-1);
        // From the scan call to the end of its try/catch there must be no `return
        // res.status`. If a later lane flips this to a refusal, this test fails and
        // makes them say so deliberately rather than by accident.
        const tail = route.slice(scanAt, scanAt + 900);
        expect(tail).not.toMatch(/return\s+res\.status/);
    });
});
