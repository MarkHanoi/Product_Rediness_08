// ─────────────────────────────────────────────────────────────────────────────
// verify-delivery.mts — §TEXTURE-PIPELINE L-1724. What is PROVEN, and what is not.
//
// ⚠ THIS FILE EXISTS BECAUSE OF ISSUE-LOG L-578, WHICH IS THIS REPO'S SHARPEST
//   LESSON. The furniture catalogue took FOUR deploys to fix because the upload
//   probe, the Range probe, `curl`, `aws s3 ls` and every Node probe all returned a
//   clean 200/206 while the browser refused every single asset. None of those
//   checks enforce CORS. Only a browser does.
//
//   So this probe does two things, and the second matters as much as the first:
//   it proves what it can, and it PRINTS WHAT IT CANNOT PROVE, by name, every run.
//   A probe that reports only its successes is how "green" and "broken" coexist.
//
// ARMS
//   A — DELIVERY SEAM (offline, hard-0). Executes the REAL guards that will see
//       these paths in production: `isSafeCatalogKey` from the proxy, and
//       `resolveCatalogAssetUrl` from the client. Proves our key scheme is accepted
//       by code we do not own and did not change.
//   B — INTEGRITY + DECODE (offline, hard-0). Every published file exists, matches
//       its manifest SHA-256, and decodes as a WebP of the recorded dimensions.
//   C — PUBLIC FETCH (network, opt-in via --base). HTTP status, content-type, and a
//       SHA-256 match of the delivered bytes against the manifest.
//
// USAGE
//   npx tsx tools/texture-pipeline/verify-delivery.mts
//   npx tsx tools/texture-pipeline/verify-delivery.mts --base https://pub-….r2.dev/items/
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// The REAL modules that will see these paths in production. Importing them rather
// than re-implementing their rules is the whole point: a re-implementation would
// pass while production refused (§FAKE-MORE-CAPABLE-THAN-REAL).
import { isSafeCatalogKey } from '../../server/context-delivery/catalogAssetProxy.js';
import { resolveCatalogAssetUrl } from '../../apps/editor/src/ui/furniture-carousel/catalogAssetUrl.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, 'textures.manifest.json');
const DIST = path.join(HERE, 'out', 'dist');

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

interface MapEntry { file: string; logicalPath: string; bytes: number; sha256: string; width: number; height: number }
interface Material { id: string; published?: { maps: Record<string, MapEntry> } }

function loadSharp(): any {
    const req = createRequire(import.meta.url);
    for (const root of [HERE, process.cwd(), path.resolve(HERE, '../..')]) {
        try { return req(req.resolve('sharp', { paths: [root] })); } catch { /* next */ }
    }
    const store = path.resolve(HERE, '../../node_modules/.pnpm');
    if (fs.existsSync(store)) {
        const hit = fs.readdirSync(store).find((d) => /^sharp@/.test(d));
        if (hit) { try { return req(path.join(store, hit, 'node_modules', 'sharp')); } catch { /* next */ } }
    }
    return null;
}

async function main() {
    const argv = process.argv.slice(2);
    const baseIdx = argv.indexOf('--base');
    const base = baseIdx >= 0 ? argv[baseIdx + 1] : process.env.VITE_GLB_URL ?? '';

    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { logicalRoot: string; materials: Material[] };
    const entries: Array<{ id: string; map: string; e: MapEntry }> = [];
    const unpublished: string[] = [];
    for (const m of manifest.materials) {
        const maps = Object.entries(m.published?.maps ?? {});
        if (!maps.length) unpublished.push(m.id);
        for (const [name, e] of maps) entries.push({ id: m.id, map: name, e });
    }
    console.log(`[verify] ${manifest.materials.length} material(s), ${entries.length} published map file(s)\n`);

    // ⛔ A material with no `published` block contributes NO entries, so every arm
    // below would pass it vacuously. Silent under-verification that reports green is
    // the failure mode this whole script exists to prevent — so it is a hard failure.
    if (unpublished.length) {
        console.log(`⛔ ${unpublished.length} material(s) in the manifest have NO published maps — run compress.mjs:`);
        for (const id of unpublished) console.log(`     ${id}`);
        console.log('   (Left unchecked these would be counted as passing by omission.)\n');
    }

    let failA = 0; let failB = 0; let failC = 0;

    // ── ARM A — DELIVERY SEAM ───────────────────────────────────────────────
    for (const { id, map, e } of entries) {
        const logical = e.logicalPath;
        if (!logical.startsWith('/items/')) { console.log(`  A FAIL ${id}/${map}: logical path does not ride the /items/ seam: ${logical}`); failA += 1; continue; }
        const proxyKey = logical.slice('/items/'.length);
        if (!isSafeCatalogKey(proxyKey)) { console.log(`  A FAIL ${id}/${map}: proxy REFUSES key "${proxyKey}"`); failA += 1; continue; }
        const resolved = resolveCatalogAssetUrl(logical);
        const expected = base ? `${base.replace(/\/+$/, '')}/${proxyKey}` : logical;
        if (resolved !== expected) { console.log(`  A FAIL ${id}/${map}: resolver produced ${resolved}, expected ${expected}`); failA += 1; }
    }
    console.log(`ARM A — DELIVERY SEAM (proxy allowlist + client rewrite) : ${entries.length - failA}/${entries.length} pass`);
    if (base) console.log(`         base in use: ${base}`);
    else console.log('         (no --base/VITE_GLB_URL: rewrite tested in its local-dev identity mode)');

    // ── ARM B — INTEGRITY + DECODE ──────────────────────────────────────────
    const sharp = loadSharp();
    if (!fs.existsSync(DIST)) {
        console.log('\nARM B — SKIPPED: no out/dist. Run acquire.mjs then compress.mjs.');
        failB = -1;
    } else {
        for (const { id, map, e } of entries) {
            const p = path.join(DIST, id, e.file);
            if (!fs.existsSync(p)) { console.log(`  B FAIL ${id}/${map}: missing ${p}`); failB += 1; continue; }
            const buf = fs.readFileSync(p);
            if (sha256(buf) !== e.sha256) { console.log(`  B FAIL ${id}/${map}: SHA-256 mismatch`); failB += 1; continue; }
            if (sharp) {
                try {
                    const meta = await sharp(buf).metadata();
                    if (meta.format !== 'webp' || meta.width !== e.width || meta.height !== e.height) {
                        console.log(`  B FAIL ${id}/${map}: decoded as ${meta.format} ${meta.width}x${meta.height}, manifest says webp ${e.width}x${e.height}`);
                        failB += 1;
                    }
                } catch (err) { console.log(`  B FAIL ${id}/${map}: does not decode — ${(err as Error).message}`); failB += 1; }
            }
        }
        console.log(`\nARM B — INTEGRITY + DECODE (sha256 + ${sharp ? 'real WebP decode' : 'sha256 only, sharp absent'}) : ${entries.length - failB}/${entries.length} pass`);
    }

    // ── ARM C — PUBLIC FETCH ────────────────────────────────────────────────
    if (!base) {
        console.log('\nARM C — SKIPPED (no --base). Nothing is claimed about public serving.');
        failC = -1;
    } else {
        let checked = 0;
        for (const { id, map, e } of entries) {
            const url = resolveCatalogAssetUrl(e.logicalPath);
            let res: Response;
            try { res = await fetch(url, { redirect: 'follow' }); }
            catch (err) { console.log(`  C FAIL ${id}/${map}: fetch threw — ${(err as Error).message}`); failC += 1; continue; }
            if (!res.ok) { console.log(`  C FAIL ${id}/${map}: HTTP ${res.status} ${url}`); failC += 1; continue; }
            const ct = res.headers.get('content-type') ?? '';
            if (!ct.includes('image/webp')) { console.log(`  C WARN ${id}/${map}: content-type "${ct}" (expected image/webp)`); }
            const buf = Buffer.from(await res.arrayBuffer());
            if (sha256(buf) !== e.sha256) { console.log(`  C FAIL ${id}/${map}: served bytes do not match the manifest SHA-256`); failC += 1; continue; }
            checked += 1;
        }
        console.log(`\nARM C — PUBLIC FETCH (status + content-type + sha256 of delivered bytes) : ${checked}/${entries.length} pass`);
    }

    // ── ⛔ WHAT THIS PROBE DOES NOT ESTABLISH ────────────────────────────────
    console.log(`
⛔ NOT ESTABLISHED BY THIS PROBE — read this before reporting anything as "working":
   1. CORS. Node's fetch does NOT enforce it. ARM C can pass on every file while a
      BROWSER refuses all of them, which is exactly what happened to the GLB
      catalogue for four deploys (ISSUE-LOG L-578). Only loading a texture in a real
      browser tab establishes this. The same-origin proxy route
      (/api/catalog/items/textures/…) sidesteps it, and ARM A proves those keys are
      accepted — but "accepted by the guard" is not "fetched by a browser".
   2. THAT ANY TEXTURE REACHES A MATERIAL. No producer writes MaterialRecord.maps
      today; C100 §10.6 measures seven waiting consumers of matDef.textures.* and
      records that ".textures is written by nothing". That is MAT-1's seam, not this
      lane's. Published and reachable are different facts.
   3. VISUAL CORRECTNESS. Nothing here looks at the images. Pattern sub-type
      (herringbone vs chevron), colour fidelity and tiling seams need a human pass.`);

    const hard = Math.max(failA, 0) + Math.max(failB, 0) + Math.max(failC, 0) + unpublished.length;
    if (hard > 0) { console.log(`\n[verify] ⛔ ${hard} failure(s).`); process.exit(1); }
    console.log('\n[verify] OK — every arm that ran, passed.');
}

main().catch((err) => { console.error(`[verify] fatal: ${err.stack ?? err.message}`); process.exit(2); });
