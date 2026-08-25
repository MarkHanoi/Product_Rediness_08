#!/usr/bin/env -S npx tsx
// PRYZM — `tools/facade-reconstruct` · the CLI leg of SPEC §4's Milestone 1.
//
// C108 · ADR-0371 · SPEC-FACADE-RECONSTRUCTION-PIPELINE · L-11000..L-11011
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
// Until it did, `reconstructFacade(image, options)` had NO CALLER. The engine was
// proven against 30 synthetic corpus cases and against nothing a human could put
// in front of it — which is precisely the authored-but-unreachable shape
// [[authored-but-unwired-is-the-bottleneck]] and [[committed-is-not-reachable]]
// record. A photograph on disk plus this script is now a full run: IR, every
// brief §18 overlay, and a summary that states what was NOT measured.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
// ⛔ It does not decode JPEG (L-11003). `packages/facade-reconstruction/src/
//    testing/png.ts` is a zero-dependency PNG codec on Node's built-in zlib, and
//    that is the whole of C108 §7.1's "ZERO new dependencies". A JPEG decoder
//    would be either a dependency with a licence to audit (brief §20) or several
//    hundred lines nobody maintains. Re-save the photo as an 8-bit PNG; the
//    BROWSER panel decodes JPEG/WebP/AVIF/HEIC for free (C108 §8.3).
// ⛔ It never writes `scale.metersPerUnit` from a prior. Scale is UNKNOWN unless
//    `--ref` supplies it (C108 §2.2, L-11009).
//
// ── LAYERING ────────────────────────────────────────────────────────────────
// `tools/` is outside the workspace graph, so it relative-imports `packages/*/src`
// exactly as `tools/ga-gate/check-chat-capability-coverage.ts` and
// `tools/block-dissolve-audit/audit.mts` already do. No manifest change, so no
// `pnpm-lock.yaml` drift.
//
// USAGE
//   npx tsx tools/facade-reconstruct/reconstruct.ts <image.png> [options]
//
//   --out <dir>          Output directory. Default: <image-dir>/<image-name>-facade
//   --quad "x,y x,y x,y x,y"
//                        Facade corners in CROPPED-FRAME pixels, clockwise from
//                        top-left. ⭐ ALWAYS wins over automatic detection
//                        (brief §6): the user clicking four corners is the
//                        SPECIFIED fallback, not a failure mode.
//   --ref "x,y x,y <m>"  Reference dimension: two points in NORMALIZED facade
//                        coordinates (0..1, Y up) and the real length in metres
//                        between them (brief §16). Without it, scale is UNKNOWN.
//   --no-crop            Skip the screenshot-chrome crop (C108 §3.1).
//   --long-side <px>     Rectified output long side. Default 512.
//   --json               Print the IR to stdout and write nothing.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';

import {
    applyReferenceDimension,
    reconstructFacade,
    type FacadeIR,
    type FacadeReconstructionOptions,
    type Point2,
    type Quad,
} from '../../packages/facade-reconstruction/src/index.js';
import type { FacadeDiagnostics } from '../../packages/facade-reconstruction/src/contracts/Diagnostics.js';
import {
    allOverlays,
    decodePng,
    encodePng,
} from '../../packages/facade-reconstruction/src/testing/index.js';

// ── argv ─────────────────────────────────────────────────────────────────────

interface Args {
    readonly image: string;
    readonly out: string | null;
    readonly quad: Quad | null;
    readonly ref: { p0: Point2; p1: Point2; meters: number } | null;
    readonly options: Partial<FacadeReconstructionOptions>;
    readonly jsonOnly: boolean;
}

function fail(message: string): never {
    process.stderr.write(`facade-reconstruct: ${message}\n`);
    process.exit(2);
}

/** `"x,y"` -> a point. Refuses anything else rather than coercing a NaN. */
function point(token: string, what: string): Point2 {
    const parts = token.split(',');
    if (parts.length !== 2) fail(`${what}: expected "x,y", got "${token}"`);
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) fail(`${what}: "${token}" is not a finite point`);
    return { x, y };
}

function parseArgs(argv: readonly string[]): Args {
    let image: string | null = null;
    let out: string | null = null;
    let quad: Quad | null = null;
    let ref: { p0: Point2; p1: Point2; meters: number } | null = null;
    let jsonOnly = false;
    const options: Partial<FacadeReconstructionOptions> = {};

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]!;
        if (a === '--out') out = argv[++i] ?? fail('--out needs a directory');
        else if (a === '--no-crop') options.cropEnabled = false;
        else if (a === '--json') jsonOnly = true;
        else if (a === '--long-side') {
            const n = Number(argv[++i]);
            if (!Number.isInteger(n) || n < 64) fail('--long-side needs an integer >= 64');
            options.rectifiedLongSide = n;
        } else if (a === '--quad') {
            const tokens = (argv[++i] ?? fail('--quad needs four "x,y" corners')).trim().split(/\s+/);
            if (tokens.length !== 4) fail(`--quad needs exactly four corners, got ${tokens.length}`);
            quad = [
                point(tokens[0]!, '--quad'),
                point(tokens[1]!, '--quad'),
                point(tokens[2]!, '--quad'),
                point(tokens[3]!, '--quad'),
            ] as unknown as Quad;
        } else if (a === '--ref') {
            const tokens = (argv[++i] ?? fail('--ref needs "x,y x,y <metres>"')).trim().split(/\s+/);
            if (tokens.length !== 3) fail('--ref needs "x,y x,y <metres>"');
            const meters = Number(tokens[2]);
            if (!Number.isFinite(meters) || meters <= 0) fail(`--ref: "${tokens[2]}" is not a positive length`);
            ref = { p0: point(tokens[0]!, '--ref'), p1: point(tokens[1]!, '--ref'), meters };
        } else if (a.startsWith('--')) fail(`unknown option "${a}"`);
        else if (image === null) image = a;
        else fail(`unexpected argument "${a}" — one image at a time`);
    }
    if (image === null) {
        fail('an image path is required.\n  npx tsx tools/facade-reconstruct/reconstruct.ts <image.png> [--out dir] [--quad "x,y x,y x,y x,y"] [--ref "x,y x,y 2.1"]');
    }
    if (quad !== null) options.facadeQuad = quad;
    return { image, out, quad, ref, options, jsonOnly };
}

// ── the honest summary ───────────────────────────────────────────────────────

/** A confidence scalar as text. ⛔ `null` prints UNKNOWN, never `0.00`. */
function conf(score: number | null): string {
    return score === null ? 'UNKNOWN' : score.toFixed(2);
}

/**
 * The report the founder reads.
 *
 * ⭐ Its job is not to look confident. C108 §4 makes confidence first-class, and
 * every line that could be mistaken for a measurement carries the reason it is not
 * one. The three standing M1 unknowns — scale, protrusion depth, curvature radius —
 * are printed EVERY run, whether or not they happened to come out null, because a
 * reader cannot tell an absent line from a measured zero.
 */
function summarise(ir: FacadeIR, d: FacadeDiagnostics, imagePath: string): string {
    const f = ir.facade;
    const L: string[] = [];
    L.push(`PRYZM facade reconstruction — ${imagePath}`);
    L.push('');
    L.push(`  crop            ${d.crop.applied ? `applied ${JSON.stringify(d.crop.rect)}` : `not applied${d.crop.refusedReason === null ? '' : ` (REFUSED: ${d.crop.refusedReason})`}`}`);
    L.push(`  facade plane    ${d.facadeQuad.status}   confidence ${conf(f.confidence)}`);
    if (d.facadeQuad.status === 'needs-user') {
        L.push('                  ⛔ NO PLANE FOUND. Every derived confidence below is UNKNOWN by');
        L.push('                     propagation (C108 §4.3), and the structure was measured on the');
        L.push('                     UN-RECTIFIED frame. Re-run with --quad "x,y x,y x,y x,y" —');
        L.push('                     brief §6 makes the four clicks the specified fallback.');
    }
    L.push(`  rectified       ${d.rectified.image === null ? 'none' : `${d.rectified.image.width}x${d.rectified.image.height}  aspect ${d.rectified.aspect === null ? 'UNKNOWN' : d.rectified.aspect.toFixed(3)}`}`);
    // ⭐ C108 §3.4 keeps TWO rival measurements alive on purpose, so the summary
    // names WHICH one produced this lattice and what the other one said. Printing
    // only the winner is how "2 zone(s) x 2 bay(s)" looked like an answer on the
    // first real photograph (L-10971).
    const bayCount = f.zones[0]?.cells.length ?? 0;
    L.push(
        `  lattice         ${f.zones.length} zone(s) x ${bayCount} bay(s)   from ` +
            (d.lattice.zones.source === 'openings'
                ? 'THE DETECTED OPENINGS'
                : 'the wall projection profile'),
    );
    if (d.lattice.zones.source === 'projection-profile') {
        L.push(`                  ⚠ the openings did not support a lattice: ${d.lattice.zones.refusedReason ?? 'refused'}`);
    } else if (d.lattice.zones.fromProfile !== f.zones.length || d.lattice.bays.fromProfile !== bayCount) {
        L.push(
            `                  ⚠ SOURCES DISAGREE — the wall projection profile reads ` +
                `${d.lattice.zones.fromProfile} zone(s) x ${d.lattice.bays.fromProfile} bay(s).`,
        );
        L.push('                     Compare 05-structure.png against the photograph and judge.');
    }
    const openings = f.zones.reduce((n, z) => n + z.cells.filter((c) => c.opening !== null).length, 0);
    L.push(`  openings        ${openings} matched · ${f.features.length} feature(s) · ${f.outliers.length} outlier(s)`);
    L.push(`  periodicity     repeatX ${f.periodicity.repeatX ?? 'UNKNOWN'} · repeatY ${f.periodicity.repeatY ?? 'UNKNOWN'}   confidence ${conf(f.periodicity.confidence)}`);
    L.push(`  symmetry        axisX ${f.symmetry.axisX === null ? 'UNKNOWN' : f.symmetry.axisX.toFixed(3)} · score ${conf(f.symmetry.score)}   (UNVERIFIED, L-10978)`);
    L.push(`  curvature       left ${f.curvature.left.normalizedDeviation === null ? 'UNKNOWN' : f.curvature.left.normalizedDeviation.toFixed(4)} · right ${f.curvature.right.normalizedDeviation === null ? 'UNKNOWN' : f.curvature.right.normalizedDeviation.toFixed(4)}`);
    L.push(`  surface         ${f.surface.pattern}${f.surface.pattern === 'grid' ? ` pitch ${f.surface.scaleX?.toFixed(4) ?? '?'} x ${f.surface.scaleY?.toFixed(4) ?? '?'}` : ''}   confidence ${conf(f.surface.confidence)}`);
    L.push(`  scale           ${ir.scale.status.toUpperCase()}${ir.scale.status === 'user-supplied' ? ` — ${ir.scale.metersPerUnit!.toFixed(4)} m per normalized unit` : ` (${ir.scale.unknownReason ?? 'no reason recorded'})`}`);
    L.push('');
    L.push('  ── WHAT THIS RUN DID NOT MEASURE ────────────────────────────────────');
    if (ir.scale.status !== 'user-supplied') {
        L.push('  · SCALE. Units are NORMALIZED, not metres, and no dimension in the IR is a');
        L.push('    real-world length. Supply --ref "x,y x,y <metres>" to convert (brief §16).');
        L.push('    ⛔ There is no third source: no storey prior, no door prior, no EXIF (L-11009).');
    }
    L.push('  · PROTRUSION DEPTH is null in Milestone 1 and that is the correct value');
    L.push('    (C108 §3.10, L-11005). The soffit BAND is measured; the depth is not.');
    L.push('  · THE SYMMETRY AXIS ABOVE IS NOT CERTIFIED (L-10978). Every corpus case is');
    L.push('    drawn symmetric about 0.500 and NINE OF FOURTEEN report 0.299 at score 0.97:');
    L.push('    a periodic facade has an exact mirror axis at every bay centre and every bay');
    L.push('    boundary, so the argmax is choosing among many near-equal candidates. Read the');
    L.push('    SCORE as "is this facade mirror-symmetric at all" and do NOT read the AXIS as');
    L.push('    the building\'s centreline.');
    L.push('  · CURVATURE RADIUS is null in Milestone 1 (C108 §3.9, L-11004). One');
    L.push('    uncalibrated image says the edges bend, not by what radius.');
    L.push('  · SURFACE / TILING is UNVERIFIED and the surface row above is NOT a measurement');
    L.push('    (L-11012). S16 was probed against KNOWN tile pitches and the probe FALSIFIED it:');
    L.push('    on a facade with openings it returns the OPENING LATTICE for every pitch tested');
    L.push('    (~0.20 x ~0.25 whether the tiles are 5px or 20px) at confidence 0.69-0.79, and');
    L.push('    without openings it locks onto a 2x or 3x HARMONIC at pitches 8, 16 and 20. No');
    L.push('    corpus case was added: the only pitches that pass are the ones that pass, and a');
    L.push('    case chosen for that reason is the overfit C108 §9 forbids.');
    L.push('  · THIS ENGINE\'S CORPUS IS SYNTHETIC (L-11001, OPEN). Every threshold was');
    L.push('    fixed against images the generator drew. A real photograph is the first');
    L.push('    thing that can falsify it — failures here are the POINT, not a setback.');
    L.push('');
    L.push('  ── STAGE NOTES ──────────────────────────────────────────────────────');
    for (const n of d.notes) L.push(`  · ${n}`);
    return L.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const imagePath = resolve(args.image);

    let bytes: Uint8Array;
    try {
        bytes = new Uint8Array(readFileSync(imagePath));
    } catch (e) {
        fail(`cannot read ${imagePath}: ${(e as Error).message}`);
    }

    let image;
    try {
        image = decodePng(bytes);
    } catch (e) {
        const ext = extname(imagePath).toLowerCase();
        const hint =
            ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.heic'
                ? `\n  ⛔ This CLI reads 8-bit PNG only (L-11003). Re-save "${basename(imagePath)}" as PNG.` +
                  '\n     The browser panel (apps/editor/src/ui/facade) decodes JPEG/WebP/AVIF/HEIC natively.'
                : '';
        fail(`${(e as Error).message}${hint}`);
    }

    const { ir: rawIr, diagnostics } = await reconstructFacade(image, args.options);

    // brief §16 — the ONLY route by which a metre enters this IR.
    let ir = rawIr;
    if (args.ref !== null) {
        try {
            ir = applyReferenceDimension(rawIr, args.ref.p0, args.ref.p1, args.ref.meters);
        } catch (e) {
            fail(`--ref rejected: ${(e as Error).message}`);
        }
    }

    if (args.jsonOnly) {
        process.stdout.write(`${JSON.stringify(ir, null, 2)}\n`);
        return;
    }

    const outDir =
        args.out !== null
            ? resolve(args.out)
            : join(dirname(imagePath), `${basename(imagePath, extname(imagePath))}-facade`);
    mkdirSync(outDir, { recursive: true });

    writeFileSync(join(outDir, 'facade-ir.json'), `${JSON.stringify(ir, null, 2)}\n`, 'utf8');

    // ⛔ Diagnostics are NOT the IR (C108 §1.3) and are written to their own file so
    // that nothing serialising `facade-ir.json` ever ships an intermediate raster
    // into a project. The rasters are dropped here; they leave as PNGs below.
    writeFileSync(
        join(outDir, 'diagnostics.json'),
        `${JSON.stringify(
            {
                crop: { rect: diagnostics.crop.rect, applied: diagnostics.crop.applied, refusedReason: diagnostics.crop.refusedReason },
                edges: { highThreshold: diagnostics.edges.highThreshold },
                lineCount: diagnostics.lines.length,
                vanishingPoints: diagnostics.vanishingPoints,
                facadeQuad: diagnostics.facadeQuad,
                rectified: { aspect: diagnostics.rectified.aspect, produced: diagnostics.rectified.image !== null },
                rows: diagnostics.rows === null ? null : { period: diagnostics.rows.period, phase: diagnostics.rows.phase, fit: diagnostics.rows.fit, peaks: diagnostics.rows.peaks, breaks: diagnostics.rows.breaks },
                cols: diagnostics.cols === null ? null : { period: diagnostics.cols.period, phase: diagnostics.cols.phase, fit: diagnostics.cols.fit, peaks: diagnostics.cols.peaks, breaks: diagnostics.cols.breaks },
                blobs: diagnostics.blobs,
                symmetry: diagnostics.symmetry,
                soffits: diagnostics.soffits,
                confidenceHeatmap: diagnostics.confidenceHeatmap,
                notes: diagnostics.notes,
            },
            null,
            2,
        )}\n`,
        'utf8',
    );

    // brief §18 — every layer, as a lookable image.
    const layers = allOverlays(diagnostics, ir);
    for (const layer of layers) {
        writeFileSync(join(outDir, `${layer.name}.png`), encodePng(layer.image));
    }

    const summary = summarise(ir, diagnostics, imagePath);
    writeFileSync(join(outDir, 'summary.txt'), `${summary}\n`, 'utf8');
    process.stdout.write(`${summary}\n\n`);
    process.stdout.write(`  wrote ${layers.length + 3} file(s) to ${outDir}\n`);
    for (const layer of layers) process.stdout.write(`    ${layer.name}.png\n`);
}

main().catch((e: unknown) => {
    process.stderr.write(`facade-reconstruct: ${(e as Error).stack ?? String(e)}\n`);
    process.exit(1);
});
