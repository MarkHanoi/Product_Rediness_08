#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// compress.mjs — §TEXTURE-PIPELINE L-1721. Compression + constant-map folding.
//
// THE PROBLEM, MEASURED: 16 materials acquired at 2K JPEG are 207 MB of map files.
// Publishing that is not shippable — one parquet alone is 6.8 MB across six maps.
//
// ⛔ WHY NOT KTX2 AS THE SHIPPING FORMAT — AND THIS IS A CORRECTION TO THE
//    ASSUMPTION THIS LANE STARTED FROM.
// `server/context-delivery/catalogAssetProxy.js` allowlists `.ktx2`, which reads
// like textures are already supported end-to-end. They are not. Measured 2026-08-21:
//
//   grep -rn "KTX2Loader" packages apps plugins src   -> ZERO HITS
//   packages/persistence-client/src/codec/ktx2.ts     -> a STUB that "returns the
//                                                        input bytes unchanged"
//
// So the repo can DELIVER a .ktx2 and cannot DECODE one. Basis-compressed KTX2 needs
// `KTX2Loader` + the `basis_transcoder.wasm` pair wired into the renderer's loading
// manager — that is the render path, which this lane does not own (MAT-1). Shipping
// KTX2-only would mint a published asset set whose only possible state is "broken":
// §COMMITTED-IS-NOT-REACHABLE, and precisely what C100 §10.6 forbids ("MUST NOT: a
// slice ship `maps` while nothing can load them").
//
// ✅ THEREFORE WEBP IS THE SHIPPING FORMAT, and it is not a grudging fallback:
//    - `THREE.TextureLoader` decodes it through the browser's own image decoder,
//      with ZERO loader wiring, zero wasm, zero transcoder.
//    - `.webp` is ALREADY on `CATALOG_ALLOWED_EXT`, so it rides the existing seam.
//    - It reaches ~4-8x smaller than the source JPEG at visually equivalent quality.
//    ⚠ Its real cost vs KTX2 is GPU MEMORY, not bytes on the wire: WebP decodes to
//      uncompressed RGBA in VRAM, where a Basis/KTX2 texture stays compressed. That
//      matters at scene scale and is the reason KTX2 remains the right end state.
//      `--ktx2` emits it as a SECOND output the moment a decoder exists.
//
// ⭐ CONSTANT-MAP FOLDING. 15 of 16 acquired materials ship no metalness map at all
// (they are dielectrics), and where one exists it is a constant 0. A map whose every
// texel is identical is a scalar wearing a 2048x2048 costume. This script detects
// that and records the SCALAR in the manifest instead of publishing the file — which
// is both smaller and more correct, because the resolver can set `metalness: 0`
// directly rather than binding a texture to say it.
//
// USAGE
//   node tools/texture-pipeline/compress.mjs
//   node tools/texture-pipeline/compress.mjs --max-size 1024
//   node tools/texture-pipeline/compress.mjs --ktx2      # additionally emit .ktx2 if toktx is on PATH
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const MANIFEST = path.join(HERE, 'textures.manifest.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * PER-MAP COMPRESSION PROFILES. ⚠ These are NOT one setting applied six times —
 * an albedo and a normal map fail differently under lossy compression.
 *
 *  - `color` is the only map a human reads as an image; ordinary lossy WebP is fine.
 *  - `normal` encodes a VECTOR in RGB, so it gets the HIGHEST quality of any map —
 *    but lossy, not near-lossless. ⚠ MEASURED, because the first cut of this file
 *    got it wrong: `nearLossless` produced 1.37 MB for one 2K normal against
 *    0.24 MB at q95 — 5.7x the bytes, and normals were 61% of the whole payload.
 *    q95 is far above where normal-map banding becomes visible; near-lossless was
 *    paying for precision no shading model can use.
 *  - `displacement` drives geometry (or parallax) and is smooth, low-frequency data;
 *    q92 greyscale holds it without stepping, since it is 1 channel.
 *  - `roughness` / `ao` / `metalness` are single-channel data maps; greyscale at
 *    high quality is both smaller and more honest than a 3-channel encode.
 */
const PROFILES = {
    color: { grey: false, webp: { quality: 88, effort: 5 } },
    normal: { grey: false, webp: { quality: 95, effort: 5 } },
    displacement: { grey: true, webp: { quality: 92, effort: 5 } },
    roughness: { grey: true, webp: { quality: 90, effort: 5 } },
    ao: { grey: true, webp: { quality: 90, effort: 5 } },
    metalness: { grey: true, webp: { quality: 90, effort: 5 } },
};

/**
 * ⭐ CONSTANT-MAP DETECTION — the fraction of pixels that deviate from the channel
 * mean, NOT min/max and NOT standard deviation. Both of the simpler tests were
 * written first and both were WRONG, in opposite directions:
 *
 *  - MIN/MAX is defeated by JPEG ringing. WoodFloor043's metalness is uniformly
 *    zero yet measures `min 0, max 255` because compression leaves isolated spikes.
 *  - STANDARD DEVIATION is defeated by SPARSE DETAIL, which is the dangerous one.
 *    A tile normal map is a flat field plus thin grout lines: the bulk is uniform,
 *    so global stdev stays low (4.33) even though the grout is the entire point of
 *    the map. A stdev threshold folded four tile/parquet normal maps and one roof
 *    tile's COLOUR map to flat scalars — it would have published a roof as a single
 *    brown rectangle.
 *
 * MEASURED SEPARATION (2026-08-21, % of pixels deviating from the mean by > 6):
 *      true-constant metalness   0.065%
 *      marble normal (seams)     0.428%  <- REAL, and the closest call in the set
 *      tile normal (grout)       2.22%   ·  tile normal 141        2.77%
 *      plaster roughness         9.86%   ·  parquet normal        14.74%
 *      roof-tile colour         15.05%
 *
 * ⭐ THE THRESHOLD IS DELIBERATELY BIASED TOWARD PUBLISHING, because the two errors
 * do not cost the same. Publishing a near-flat map wastes ~50 KB. Folding a map that
 * had real detail DESTROYS that detail — the marble tile would lose its seams and the
 * roof its tile relief, silently and permanently. So the threshold sits close to the
 * constant (2.3x) rather than splitting the range: when in doubt, ship the texture.
 *
 * ⚠ EPSILON IS 6 AND MUST NOT BE RAISED to "suppress ringing" — measured, that makes
 * it worse: at eps=12 a genuine low-amplitude plaster roughness map collapses from
 * 9.86% to 0.0986% and would be folded flat; at eps=20 it reads 0.0000%. The subtle
 * real maps are exactly the ones a wider band destroys.
 */
const CONSTANT_DEVIATION_EPSILON = 6;      // JPEG noise band, in 8-bit levels
const CONSTANT_DEVIATION_FRACTION = 0.0015; // 0.15% of pixels

/**
 * Resolve `sharp` WITHOUT declaring a dependency here.
 *
 * ⚠ WHY THIS IS A SOFT RESOLUTION AND NOT AN IMPORT. `tools/*` is a pnpm workspace
 * pattern (pnpm-workspace.yaml), so adding a package.json under this directory would
 * add a workspace importer and break `pnpm install --frozen-lockfile` for every other
 * lane in the tree. sharp is present in this repo's store transitively; CI installs it
 * explicitly into a scratch directory (the pattern terrain-bake.yml already uses).
 * If it is absent we say so by NAME rather than emitting uncompressed output.
 */
async function loadSharp() {
    const req = createRequire(import.meta.url);
    const roots = [HERE, process.cwd(), path.resolve(HERE, '../..')];
    for (const root of roots) {
        try {
            return req(req.resolve('sharp', { paths: [root] }));
        } catch { /* try next */ }
    }
    // pnpm's store is not on the default resolution path from tools/.
    const store = path.resolve(HERE, '../../node_modules/.pnpm');
    if (fs.existsSync(store)) {
        const hit = fs.readdirSync(store).find((d) => /^sharp@/.test(d));
        if (hit) {
            try {
                return req(path.join(store, hit, 'node_modules', 'sharp'));
            } catch { /* fall through */ }
        }
    }
    throw new Error(
        'sharp could not be resolved.\n' +
        '  This step needs an image encoder. Install one standalone (NOT into the root\n' +
        '  package.json — that breaks --frozen-lockfile for other lanes):\n' +
        '      mkdir -p .texture-tools && cd .texture-tools && npm init -y && npm i sharp\n' +
        '      NODE_PATH=.texture-tools/node_modules node tools/texture-pipeline/compress.mjs\n' +
        '  CI does exactly this — see .github/workflows/r2-sync-textures.yml.',
    );
}

/**
 * Scan raw pixels at FULL resolution and return the constant value (0..1) when every
 * channel is uniform, else null. Full resolution on purpose: downscaling first would
 * average sparse detail away and re-introduce the very failure this test exists to
 * avoid.
 */
async function constantValueOf(sharp, srcPath) {
    const { data, info } = await sharp(srcPath, { unlimited: true }).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    const n = info.width * info.height;
    const means = [];
    for (let c = 0; c < ch; c += 1) {
        let sum = 0;
        for (let i = c; i < data.length; i += ch) sum += data[i];
        const mean = sum / n;
        let deviating = 0;
        for (let i = c; i < data.length; i += ch) {
            if (Math.abs(data[i] - mean) > CONSTANT_DEVIATION_EPSILON) deviating += 1;
        }
        if (deviating / n > CONSTANT_DEVIATION_FRACTION) return null;
        means.push(mean);
    }
    return means[0] / 255;
}

function toktxAvailable() {
    try {
        execFileSync('toktx', ['--version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

async function main() {
    const argv = process.argv.slice(2);
    const maxSizeIdx = argv.indexOf('--max-size');
    const maxSize = maxSizeIdx >= 0 ? Number(argv[maxSizeIdx + 1]) : 2048;
    const wantKtx2 = argv.includes('--ktx2');

    if (!fs.existsSync(MANIFEST)) throw new Error(`no manifest at ${MANIFEST} — run acquire.mjs first`);
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const sharp = await loadSharp();
    console.log(`[compress] sharp ok (libvips ${sharp.versions?.vips ?? '?'}) · maxSize ${maxSize} · webp`);

    let ktx2 = false;
    if (wantKtx2) {
        ktx2 = toktxAvailable();
        console.log(
            ktx2
                ? '[compress] toktx found — emitting .ktx2 as a SECOND output.'
                : '[compress] ⚠ --ktx2 requested but `toktx` is NOT on PATH. Skipping KTX2. ' +
                  'Install KTX-Software (github.com/KhronosGroup/KTX-Software/releases) to enable.',
        );
    }

    const distRoot = path.join(OUT, 'dist');
    fs.rmSync(distRoot, { recursive: true, force: true });

    let totalIn = 0;
    let totalOut = 0;
    let folded = 0;

    for (const mat of manifest.materials) {
        const srcDir = path.join(OUT, 'maps', mat.id);
        if (!fs.existsSync(srcDir)) {
            console.log(`[compress] ${mat.id.padEnd(32)} SKIP — no acquired maps (re-run acquire.mjs)`);
            continue;
        }
        const dstDir = path.join(distRoot, mat.id);
        fs.mkdirSync(dstDir, { recursive: true });

        const published = {};
        const constants = {};
        let matIn = 0;
        let matOut = 0;

        for (const [name, acq] of Object.entries(mat.acquired.maps)) {
            const srcPath = path.join(srcDir, acq.file);
            if (!fs.existsSync(srcPath)) continue;
            const profile = PROFILES[name];
            if (!profile) continue;
            matIn += fs.statSync(srcPath).size;

            const meta = await sharp(srcPath, { unlimited: true }).metadata();

            // ⭐ CONSTANT-MAP FOLDING — a uniform map is a scalar, not a texture.
            const constant = await constantValueOf(sharp, srcPath);
            if (constant !== null) {
                constants[name] = Number(constant.toFixed(4));
                folded += 1;
                continue;
            }

            let pipe = sharp(srcPath, { unlimited: true });
            const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
            if (longest > maxSize) pipe = pipe.resize({ width: Math.round((meta.width / longest) * maxSize), fit: 'inside' });
            if (profile.grey) pipe = pipe.toColourspace('b-w');

            const buf = await pipe.webp(profile.webp).toBuffer();
            const outName = `${name}.webp`;
            fs.writeFileSync(path.join(dstDir, outName), buf);
            matOut += buf.length;

            const outMeta = await sharp(buf).metadata();
            published[name] = {
                file: outName,
                logicalPath: `${manifest.logicalRoot}${mat.id}/${outName}`,
                format: 'webp',
                bytes: buf.length,
                sha256: sha256(buf),
                width: outMeta.width,
                height: outMeta.height,
                colorSpace: acq.colorSpace,
                ...(acq.convention ? { convention: acq.convention } : {}),
                sourceFile: acq.sourceFile,
            };

            if (ktx2) {
                // UASTC for normal/displacement (quality-critical), ETC1S for the rest
                // (far smaller). Emitted alongside, never instead of, the WebP.
                const ktxOut = path.join(dstDir, `${name}.ktx2`);
                const png = await sharp(buf).png().toBuffer();
                const tmpPng = path.join(dstDir, `${name}.tmp.png`);
                fs.writeFileSync(tmpPng, png);
                const uastc = name === 'normal' || name === 'displacement';
                try {
                    execFileSync('toktx', [
                        '--t2', '--genmipmap', '--assign_oetf', acq.colorSpace === 'srgb' ? 'srgb' : 'linear',
                        ...(uastc ? ['--uastc', '2', '--zcmp', '18'] : ['--bcmp', '--clevel', '4', '--qlevel', '192']),
                        ktxOut, tmpPng,
                    ], { stdio: 'ignore' });
                    const kbuf = fs.readFileSync(ktxOut);
                    published[name].ktx2 = {
                        file: `${name}.ktx2`,
                        logicalPath: `${manifest.logicalRoot}${mat.id}/${name}.ktx2`,
                        bytes: kbuf.length,
                        sha256: sha256(kbuf),
                        encoding: uastc ? 'UASTC' : 'ETC1S',
                    };
                } catch (e) {
                    console.log(`   ⚠ toktx failed for ${mat.id}/${name}: ${String(e.message).slice(0, 100)}`);
                } finally {
                    fs.rmSync(tmpPng, { force: true });
                }
            }
        }

        mat.published = {
            format: 'webp',
            maxSize,
            maps: published,
            // Maps folded to scalars, plus maps the source never shipped. Both mean
            // "the resolver should use a scalar here", and both are recorded so the
            // absence is a STATEMENT rather than a hole.
            constantMaps: constants,
            absentAtSource: mat.acquired.missingMaps,
        };
        totalIn += matIn;
        totalOut += matOut;
        const foldNote = Object.keys(constants).length ? ` (folded ${Object.keys(constants).join(',')})` : '';
        console.log(
            `[compress] ${mat.id.padEnd(32)} ${(matIn / 1e6).toFixed(1)} MB -> ${(matOut / 1e6).toFixed(2)} MB ` +
            `(${(matOut / Math.max(matIn, 1) * 100).toFixed(0)}%)${foldNote}`,
        );
    }

    manifest.compressedAt = new Date().toISOString();
    manifest.compression = {
        format: 'webp',
        maxSize,
        profiles: PROFILES,
        ktx2Emitted: ktx2,
        note:
            'WebP is the SHIPPING format because nothing in this repo can decode KTX2 today ' +
            '(no KTX2Loader; packages/persistence-client/src/codec/ktx2.ts is a passthrough stub). ' +
            'KTX2 remains the right end state for GPU memory and is emitted by --ktx2 once a decoder is wired.',
    };
    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

    console.log(
        `\n[compress] TOTAL ${(totalIn / 1e6).toFixed(1)} MB -> ${(totalOut / 1e6).toFixed(1)} MB ` +
        `(${(totalOut / Math.max(totalIn, 1) * 100).toFixed(1)}%) · ${folded} constant map(s) folded to scalars`,
    );
    console.log(`[compress] output: ${path.relative(process.cwd(), distRoot)}`);
}

main().catch((err) => {
    console.error(`[compress] fatal: ${err.message}`);
    process.exit(2);
});
