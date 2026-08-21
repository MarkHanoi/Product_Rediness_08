#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// acquire.mjs — §TEXTURE-PIPELINE L-1720. Acquisition + the PROVENANCE MANIFEST.
//
// WHAT THIS IS FOR, IN ONE LINE: a texture library with no provenance record is how
// you end up unable to answer "where did this file come from?" in a due-diligence
// review — which is exactly the state `pascalorg/editor` is in (288 texture files,
// zero attribution; PASCAL-FINISHES-RESEARCH §0.1). The manifest is the deliverable
// that makes our set defensible; the bitmaps are just its payload.
//
// ⛔ THE HARD RULE THIS SCRIPT ENFORCES MECHANICALLY (C100 §10.6 MUST):
//    every acquired file traces to a DECLARED source library whose licence is
//    re-asserted at acquisition time. Nothing is downloaded that is not in
//    `sources/materials.json`, and no library is used whose licence block is
//    missing or is not on the CC0 allowlist. There is no flag to bypass this.
//
// ⛔ NOTHING IS SOURCED FROM pascalorg/editor. MIT covers what the authors had the
//    right to license; it is not a warranty over third-party binaries.
//
// WHAT IT PRODUCES
//   out/raw/<assetId>.zip            the source archive, kept for re-verification
//   out/maps/<materialId>/<map>.<ext>  normalised, canonical map names
//   textures.manifest.json           ⭐ THE COMMITTED ARTEFACT (provenance + integrity)
//
// ⭐ THE MANIFEST IS THE SOURCE OF TRUTH; THE BYTES ARE RE-DERIVABLE. That is what
// lets the binaries stay OUT of git (see README §Storage). Every file carries a
// SHA-256, so a later run — or a CI run, or an auditor — can prove it got the same
// bytes the author had. A hash in a 40 KB JSON gives the integrity guarantee that
// committing 60 MB of binaries would have given, and costs nothing in repo weight.
//
// USAGE
//   node tools/texture-pipeline/acquire.mjs                  # all declared materials
//   node tools/texture-pipeline/acquire.mjs --only wood-parquet-plank-043,carpet-tile-red-015
//   node tools/texture-pipeline/acquire.mjs --resolution 1K  # override declared res
//   node tools/texture-pipeline/acquire.mjs --dry-run        # resolve + assert, download nothing
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = path.join(HERE, 'sources', 'materials.json');
const OUT = path.join(HERE, 'out');
const MANIFEST = path.join(HERE, 'textures.manifest.json');

/**
 * ⛔ THE LICENCE ALLOWLIST. A library may only be used if its declared `licence`
 * appears here. Adding a licence to this list is a deliberate, reviewable act —
 * which is the point. "Permissive-looking" is not a licence.
 */
const ALLOWED_LICENCES = new Set(['CC0-1.0']);

/**
 * Canonical map names. These MATCH MAT-1's declared `MaterialRecord.maps` shape
 * (`{ color, normal, roughness, metalness, ao, displacement }`) so a catalogue row
 * can be DERIVED from this manifest rather than hand-transcribed.
 *
 * ⚠ `normal` resolves to the source's *NormalGL* file, never *NormalDX*. three.js
 * uses the OpenGL green-up convention; taking DX inverts lighting on every sloped
 * texel and looks like a lighting bug, not a texture bug.
 */
const MAP_SUFFIXES = {
    color: ['_Color'],
    normal: ['_NormalGL'],
    roughness: ['_Roughness'],
    metalness: ['_Metalness'],
    ao: ['_AmbientOcclusion'],
    displacement: ['_Displacement'],
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function args() {
    const a = process.argv.slice(2);
    const get = (flag) => {
        const i = a.indexOf(flag);
        return i >= 0 ? a[i + 1] : undefined;
    };
    return {
        only: get('--only')?.split(',').map((s) => s.trim()).filter(Boolean),
        resolution: get('--resolution'),
        dryRun: a.includes('--dry-run'),
    };
}

// ── SOURCE-LIBRARY ADAPTERS ─────────────────────────────────────────────────
// One adapter per library. Each MUST return the download URL plus whatever
// provenance the library publishes. Adding a library means adding an adapter and
// a licence block — not editing the acquisition loop.

const adapters = {
    /**
     * ambientCG — CC0-1.0. Its v2 API publishes `dimensionX`/`dimensionY` in
     * CENTIMETRES, which is the authoritative real-world tile size C100 §10.2.c
     * requires. ⭐ That single field is why this library was chosen first: most PBR
     * sources publish no physical scale at all, and a map without its scale is
     * wallpaper, not a material.
     */
    async ambientcg(entry, lib, resolution) {
        const assetId = entry.source.assetId;
        const url = `${lib.apiBase}?id=${encodeURIComponent(assetId)}&include=downloadData,dimensionsData,tagData`;
        const res = await fetch(url, { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`ambientCG API ${res.status} for ${assetId}`);
        const found = (await res.json()).foundAssets ?? [];
        const asset = found.find((a) => a.assetId.toLowerCase() === assetId.toLowerCase());
        if (!asset) throw new Error(`ambientCG has no asset "${assetId}" (API returned ${found.length} results)`);

        const attribute = `${resolution}-${entry.source.format}`;
        const zips = asset.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads ?? [];
        const dl = zips.find((d) => d.attribute === attribute);
        if (!dl) {
            throw new Error(
                `ambientCG ${assetId} has no "${attribute}" download. Available: ${zips.map((d) => d.attribute).join(', ')}`,
            );
        }

        // dimensionX/Y are centimetres; 0 means the library declares no physical size.
        const cmX = Number(asset.dimensionX) || 0;
        const cmY = Number(asset.dimensionY) || 0;

        return {
            downloadUrl: dl.fullDownloadPath,
            archiveName: dl.fileName,
            declaredBytes: dl.size,
            sourceUrl: asset.shortLink ?? `https://ambientcg.com/a/${assetId}`,
            sourceAssetName: asset.displayName ?? assetId,
            sourceReleaseDate: (asset.releaseDate ?? '').slice(0, 10) || null,
            creationMethod: asset.creationMethod ?? null,
            sourceTags: asset.tags ?? [],
            sourceMapList: asset.maps ?? [],
            realWorldSizeM: cmX > 0 && cmY > 0 ? [cmX / 100, cmY / 100] : null,
        };
    },
};

// ── ARCHIVE EXTRACTION ──────────────────────────────────────────────────────
/**
 * Extract with the system `unzip`. Deliberately NOT a new npm dependency: `tools/*`
 * is a pnpm workspace pattern, so a package.json here would add a workspace importer
 * and break `pnpm install --frozen-lockfile` for every other lane. `unzip` is present
 * on ubuntu-latest and in Git-Bash on Windows.
 */
function extract(zipPath, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    try {
        execFileSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
        throw new Error(
            `unzip failed for ${path.basename(zipPath)}: ${err.message}\n` +
            `  This pipeline needs the system 'unzip'. Install it (apt-get install -y unzip) and re-run.`,
        );
    }
    return fs.readdirSync(destDir);
}

function pickMapFile(files, suffixes, format) {
    const ext = format.toLowerCase() === 'png' ? '.png' : '.jpg';
    for (const suffix of suffixes) {
        const hit = files.find((f) => f.toLowerCase().endsWith(`${suffix}${ext}`.toLowerCase()));
        if (hit) return hit;
    }
    return null;
}

// ── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
    const opts = args();
    const decl = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));

    // ⛔ LICENCE GATE, BEFORE ANY NETWORK CALL. Every library referenced by a
    // selected material must carry a complete licence block on the allowlist.
    const selected = decl.materials.filter((m) => !opts.only || opts.only.includes(m.id));
    if (opts.only) {
        const missing = opts.only.filter((id) => !decl.materials.some((m) => m.id === id));
        if (missing.length) throw new Error(`--only names undeclared material(s): ${missing.join(', ')}`);
    }
    if (!selected.length) throw new Error('no materials selected');

    for (const m of selected) {
        const lib = decl.libraries[m.source.library];
        if (!lib) throw new Error(`${m.id}: source library "${m.source.library}" has no declaration block`);
        if (!ALLOWED_LICENCES.has(lib.licence)) {
            throw new Error(
                `${m.id}: library "${m.source.library}" declares licence "${lib.licence}", which is NOT on the ` +
                `allowlist (${[...ALLOWED_LICENCES].join(', ')}). Acquisition REFUSED.`,
            );
        }
        for (const field of ['licenceUrl', 'licenceVerifiedOn', 'homepage']) {
            if (!lib[field]) throw new Error(`${m.id}: library "${m.source.library}" is missing required provenance field "${field}"`);
        }
        if (!adapters[m.source.library]) throw new Error(`${m.id}: no adapter for library "${m.source.library}"`);
    }
    console.log(`[licence] OK — ${selected.length} material(s), all from CC0-1.0 libraries on the allowlist.`);

    const ids = new Set();
    for (const m of selected) {
        if (ids.has(m.id)) throw new Error(`duplicate material id in the declared list: ${m.id}`);
        ids.add(m.id);
    }

    const logicalRoot = decl.logicalRoot.endsWith('/') ? decl.logicalRoot : `${decl.logicalRoot}/`;
    const results = [];
    const failures = [];

    // Previously recorded provenance, used to detect UPSTREAM DRIFT (see below).
    const priorManifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : null;
    const priorById = new Map((priorManifest?.materials ?? []).map((m) => [m.id, m]));
    const allowDrift = process.argv.includes('--allow-upstream-drift');

    for (const m of selected) {
        const lib = decl.libraries[m.source.library];
        const resolution = opts.resolution ?? m.source.resolution;
        process.stdout.write(`[acquire] ${m.id.padEnd(32)} <- ${m.source.library}:${m.source.assetId} @${resolution} ... `);
        try {
            const meta = await adapters[m.source.library](m, lib, resolution);

            // ⭐ THE REAL-WORLD SIZE RULE. A declared 'source-metadata' origin MUST
            // actually find a size at the source; if the library publishes none, we
            // FAIL rather than silently invent one. An estimate must be declared in
            // the source list, in the diff — never minted here.
            let realWorldSizeM;
            let sizeOrigin = m.sizeOrigin;
            if (m.sizeOrigin === 'source-metadata') {
                if (!meta.realWorldSizeM) {
                    throw new Error(
                        `declares sizeOrigin "source-metadata" but ${m.source.library} publishes no physical ` +
                        `dimensions for ${m.source.assetId}. Declare an explicit realWorldSizeM + ` +
                        `sizeOrigin:"estimate" + sizeEstimateBasis in sources/materials.json instead.`,
                    );
                }
                realWorldSizeM = meta.realWorldSizeM;
            } else if (m.sizeOrigin === 'estimate') {
                if (!Array.isArray(m.realWorldSizeM) || m.realWorldSizeM.length !== 2) {
                    throw new Error('sizeOrigin "estimate" requires an explicit realWorldSizeM [w,h]');
                }
                if (!m.sizeEstimateBasis) throw new Error('sizeOrigin "estimate" requires sizeEstimateBasis (why this number)');
                realWorldSizeM = m.realWorldSizeM;
            } else {
                throw new Error(`unknown sizeOrigin "${m.sizeOrigin}"`);
            }

            if (opts.dryRun) {
                console.log(`DRY-RUN ok (${realWorldSizeM[0]}x${realWorldSizeM[1]} m, ${sizeOrigin})`);
                results.push({ id: m.id, dryRun: true });
                continue;
            }

            // Download the archive (once — reuse on re-runs, it is content-stable).
            const rawDir = path.join(OUT, 'raw');
            fs.mkdirSync(rawDir, { recursive: true });
            const zipPath = path.join(rawDir, meta.archiveName);
            let zipBuf;
            if (fs.existsSync(zipPath)) {
                zipBuf = fs.readFileSync(zipPath);
            } else {
                const r = await fetch(meta.downloadUrl, { redirect: 'follow' });
                if (!r.ok) throw new Error(`download ${r.status} for ${meta.downloadUrl}`);
                zipBuf = Buffer.from(await r.arrayBuffer());
                fs.writeFileSync(zipPath, zipBuf);
            }
            const archiveSha256 = sha256(zipBuf);

            // ⭐ UPSTREAM-DRIFT GATE. The manifest's whole value is that it says what we
            // actually shipped. If ambientCG re-authors an asset under the same id, a
            // silent re-acquire would leave the manifest describing bytes that no longer
            // exist — provenance that is confidently wrong, which is worse than absent.
            // A changed archive is therefore a HARD STOP requiring an explicit flag.
            const prior = priorById.get(m.id);
            if (prior?.provenance?.archiveSha256 && prior.provenance.archiveSha256 !== archiveSha256) {
                if (!allowDrift) {
                    throw new Error(
                        `UPSTREAM DRIFT — ${m.source.library}:${m.source.assetId} no longer matches the recorded archive.\n` +
                        `      manifest: ${prior.provenance.archiveSha256}\n` +
                        `      upstream: ${archiveSha256}\n` +
                        `      The source was re-authored (or the download was corrupted). Re-run with ` +
                        `--allow-upstream-drift to adopt the new bytes, and re-review the material.`,
                    );
                }
                console.log('\n   ⚠ upstream drift ADOPTED (--allow-upstream-drift)');
            }

            // Extract + normalise to canonical map names.
            const workDir = path.join(OUT, 'work', m.id);
            fs.rmSync(workDir, { recursive: true, force: true });
            const files = extract(zipPath, workDir);

            const mapsDir = path.join(OUT, 'maps', m.id);
            fs.rmSync(mapsDir, { recursive: true, force: true });
            fs.mkdirSync(mapsDir, { recursive: true });

            const maps = {};
            const missingMaps = [];
            for (const [canonical, suffixes] of Object.entries(MAP_SUFFIXES)) {
                const hit = pickMapFile(files, suffixes, m.source.format);
                if (!hit) {
                    missingMaps.push(canonical);
                    continue;
                }
                const srcPath = path.join(workDir, hit);
                const buf = fs.readFileSync(srcPath);
                const ext = path.extname(hit).toLowerCase();
                const destName = `${canonical}${ext}`;
                fs.writeFileSync(path.join(mapsDir, destName), buf);
                maps[canonical] = {
                    file: destName,
                    sourceFile: hit,
                    bytes: buf.length,
                    sha256: sha256(buf),
                    // sRGB for the albedo; every other PBR map is DATA, not colour, and
                    // must be sampled linearly or the whole shading model is wrong.
                    colorSpace: canonical === 'color' ? 'srgb' : 'linear',
                    ...(canonical === 'normal' ? { convention: 'OpenGL' } : {}),
                };
            }
            if (!maps.color) throw new Error('archive contains no _Color map — refusing to record a material with no albedo');

            results.push({
                id: m.id,
                label: m.label,
                category: m.category,
                family: m.family,
                surfaces: m.surfaces,
                tiling: { realWorldSizeM, sizeOrigin, ...(m.sizeEstimateBasis ? { sizeEstimateBasis: m.sizeEstimateBasis } : {}) },
                provenance: {
                    library: m.source.library,
                    libraryName: lib.name,
                    sourceAssetId: m.source.assetId,
                    sourceAssetName: meta.sourceAssetName,
                    sourceUrl: meta.sourceUrl,
                    downloadUrl: meta.downloadUrl,
                    archiveName: meta.archiveName,
                    archiveBytes: zipBuf.length,
                    archiveSha256,
                    licence: lib.licence,
                    licenceName: lib.licenceName,
                    licenceUrl: lib.licenceUrl,
                    attributionRequired: lib.attributionRequired,
                    commercialUse: lib.commercialUse,
                    retrievedAt: new Date().toISOString(),
                    sourceReleaseDate: meta.sourceReleaseDate,
                    creationMethod: meta.creationMethod,
                    sourceTags: meta.sourceTags,
                    resolution,
                    sourceFormat: m.source.format,
                },
                acquired: { maps, missingMaps },
            });
            console.log(`ok (${Object.keys(maps).length} maps, ${(zipBuf.length / 1e6).toFixed(1)} MB, ${realWorldSizeM[0]}x${realWorldSizeM[1]} m ${sizeOrigin})`);
        } catch (err) {
            console.log(`FAILED — ${err.message}`);
            failures.push({ id: m.id, error: err.message });
        }
    }

    if (opts.dryRun) {
        console.log(`\n[dry-run] ${results.length} resolved, ${failures.length} failed. Nothing written.`);
        process.exit(failures.length ? 1 : 0);
    }

    // Merge into the manifest rather than overwriting: a partial run (--only) must
    // not silently delete provenance for materials it did not touch.
    const byId = new Map((priorManifest?.materials ?? []).map((m) => [m.id, m]));
    for (const r of results) {
        // ⚠ CARRY THE `published` BLOCK FORWARD when the source archive is unchanged.
        // Without this, a partial re-acquire (`--only`) silently drops compress.mjs's
        // output record — and the failure is the bad kind: verify-delivery would then
        // check FEWER files and still report a pass, because a material with no
        // `published` block contributes no entries to verify. Under-verification that
        // reports green is worse than a loud failure.
        const prior = byId.get(r.id);
        if (prior?.published && prior.provenance?.archiveSha256 === r.provenance.archiveSha256) {
            r.published = prior.published;
        } else if (prior?.published) {
            console.log(`   ⚠ ${r.id}: source archive changed — dropping the stale published block; re-run compress.mjs`);
        }
        byId.set(r.id, r);
    }

    const manifest = {
        $comment: [
            'THE PROVENANCE MANIFEST — generated by tools/texture-pipeline/acquire.mjs (L-1720).',
            'DO NOT HAND-EDIT. Re-run the acquirer.',
            '',
            'Every entry records: the source library and its licence, the exact source URL, the',
            'retrieval date, the original asset name, and a SHA-256 for the archive and for every',
            'map file. That is what makes this set defensible in a due-diligence review — and it',
            'is precisely what pascalorg/editor cannot produce for its 288 texture files.',
            '',
            'It is ALSO the derivation source for catalogue rows: `tiling.realWorldSizeM` and the',
            'logical `maps` paths use MAT-1 field names verbatim, so a MaterialRecord can be',
            'derived from this file rather than transcribed by hand (C100 §0.3 single-source).',
        ],
        version: 1,
        generatedAt: new Date().toISOString(),
        generator: 'tools/texture-pipeline/acquire.mjs',
        declaredBy: 'tools/texture-pipeline/sources/materials.json',
        logicalRoot,
        licences: Object.fromEntries(
            Object.entries(decl.libraries).map(([k, v]) => [
                k,
                {
                    name: v.name,
                    homepage: v.homepage,
                    licence: v.licence,
                    licenceName: v.licenceName,
                    licenceUrl: v.licenceUrl,
                    licenceVerifiedOn: v.licenceVerifiedOn,
                    licenceVerifiedQuote: v.licenceVerifiedQuote,
                    attributionRequired: v.attributionRequired,
                    commercialUse: v.commercialUse,
                },
            ]),
        ),
        materials: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

    console.log(`\n[manifest] ${path.relative(process.cwd(), MANIFEST)} — ${manifest.materials.length} material(s)`);
    if (failures.length) {
        console.log(`[acquire] ⛔ ${failures.length} FAILED:`);
        for (const f of failures) console.log(`   ${f.id}: ${f.error}`);
        process.exit(1);
    }
    console.log('[acquire] OK');
}

main().catch((err) => {
    console.error(`[acquire] fatal: ${err.stack ?? err.message}`);
    process.exit(2);
});
