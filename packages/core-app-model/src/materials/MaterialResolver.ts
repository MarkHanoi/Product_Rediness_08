// ═════════════════════════════════════════════════════════════════════════════
// MaterialResolver — SPEC-MATERIALS-REPOSITORY §3.2, built at last (L-1701).
//
// §3.2 has been NORMATIVE and UNBUILT since 2026-05-22:
//
//   > Lazy `THREE.TextureLoader` in a shared `MaterialResolver` (one place,
//   > cached ...). Builders resolve their `MeshStandardMaterial` through the
//   > resolver: colour + `map`/`normalMap`/`roughnessMap` from the definition.
//
// C100 §10.6 measured the consequence: `matDef.textures.normal` / `.roughness`
// are READ at seven sites and WRITTEN by nothing, so *"all seven reads resolve
// `undefined` on every element, every frame"* — §COMMITTED-IS-NOT-REACHABLE in
// the shape that flatters an estimate, because the readers make the work look
// nearly done while the producer, the loader and the cache are all absent.
//
// This file is the producer, the loader and the cache. It is the ONE place a
// `MaterialRecord`'s logical map paths become `THREE.Texture` objects.
//
// ─── WHY IT LIVES HERE, AND THE P2 ANSWER ───────────────────────────────────
// L2, beside `materialLibrary.ts` — the DERIVED PROJECTION (C100 §1.3) whose
// `project()` this feeds. The master stays at L0 and stays THREE-free (P5);
// everything THREE-typed is downstream of it, which is the whole point of §1.3.
//
// P2 (single THREE owner) is satisfied the SAME WAY `materialLibrary.ts` already
// satisfies it, and no new exception is invented: THREE is imported through
// `@pryzm/renderer-three/three`, the re-export barrel that
// `tools/ga-gate/check-three-imports.ts` explicitly lists as a compliant path
// ("NOT matched (P2-compliant paths through the owner): '@pryzm/renderer-three/three'").
// This gate stays at its hard 0.
//
// ─── ONE ASSET SEAM, NOT TWO ────────────────────────────────────────────────
// Logical paths are rewritten through `resolveCatalogAssetUrl()` — the SAME seam
// the catalogue GLBs use (L-570 / OBJECT-STORAGE-R2-DECISION). C100 §10.6 records
// that the furniture 404s and the texture-hosting question are literally the same
// bucket; a second URL path would be a second answer to one question (C84 EI-8)
// and would diverge the moment either bucket moved again. That seam was moved
// from L7 to L2 by this lane for exactly this reason — it was not re-implemented.
//
// ─── ⭐ ONE TEXTURE PER (PATH x SCALE), NEVER PER ELEMENT ────────────────────
// §WEBGPU-HEAVY-SCENE-CRASH records that per-element unique MATERIALS already
// defeated instancing in this repo. A per-element TEXTURE would be far worse: it
// is a separate GPU upload each time. The cache below is keyed on the resolved
// url + colour space + repeat + rotation, all of which are properties of the
// MATERIAL, so a hundred parquet floors share one texture object and one upload.
//
// ⭐ That sharing is only possible BECAUSE the scale is a real-world size. In
// THREE, `repeat` lives on the TEXTURE, not on the material — so if the repeat
// depended on the surface's dimensions, every distinct surface size would need
// its own texture object. With metre-based UVs the repeat is `1 / realWorldSizeM`,
// a pure function of the material, and the texture is shareable by construction.
// The record-shape decision and the performance property are the same decision.
//
// ─── C100 §5: NO SILENT FALLBACK ────────────────────────────────────────────
// A map that cannot be loaded does NOT throw and does NOT substitute a texture.
// The element still renders from its base colour, and the failure becomes a
// NAMED, DEDUPLICATED diagnostic carrying the path and the reason, readable via
// `materialTextureDiagnostics()`. "This material has no maps", "this material's
// maps are mis-authored", "this surface cannot carry maps" and "this map failed
// to load" are FOUR DIFFERENT VALUES in the result type, and the compiler makes
// callers see the difference (C84 EI-1b: failure and emptiness are not the same
// value).
// ═════════════════════════════════════════════════════════════════════════════

import * as THREE from '@pryzm/renderer-three/three';
import {
    MATERIAL_MAP_CHANNELS,
    SRGB_MAP_CHANNELS,
    hasAnyMap,
    isUsableTiling,
    materialMapsDefect,
    type MaterialMapChannel,
    type MaterialMaps,
    type MaterialTiling,
} from '@pryzm/schemas/materials';
import { CATALOG_LOGICAL_PREFIX, isCatalogRehosted, resolveCatalogAssetUrl } from '../catalog/catalogAssetUrl.js';
// ⭐ THE PROCEDURAL FORK. `@pryzm/procedural-textures` is L0 — no THREE, no DOM,
// no I/O, no dependencies at all — and returns RGBA8 buffers. Turning those into
// a GPU texture is this file's job, and that division is the package's own
// stated design: "Turning those into a GPU texture is the renderer's job and
// happens above". See the fork in `acquireTexture`.
import {
    getProceduralTexture,
    isProceduralId,
    describeProceduralGenerator,
} from '@pryzm/procedural-textures';

// ─────────────────────────────────────────────────────────────────────────────
// UV SPACE — the question every call site MUST answer, because getting it wrong
// is silent.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a surface's `uv` attribute is parameterised. This is a property of the
 * GEOMETRY, not of the material, so only the builder that made the geometry can
 * answer it — which is why it is a required argument rather than a default.
 *
 * ⛔ `'none'` is not a nuisance case. A `THREE.BufferGeometry` with no `uv`
 * attribute feeds `vec2(0,0)` to the shader for every vertex, so an attached map
 * paints the ENTIRE surface with texel (0,0) — a flat colour that is neither the
 * pattern nor the material's own base colour. That is *visibly wrong*, and
 * §L-1703 rules that a visibly wrong pattern is worse than an honest flat colour.
 * So `'none'` refuses the maps and says so, rather than rendering a lie.
 */
export type SurfaceUvSpace =
    /** `uv` is in METRES on the surface — the only space that tiles at true scale. */
    | { readonly kind: 'metres' }
    /**
     * `uv` runs 0..1 across a surface whose real size is `sizeM`. Common for
     * `BoxGeometry` previews and worker-generated panel quads. Tiles correctly,
     * but only while `sizeM` is genuinely known.
     */
    | { readonly kind: 'unit'; readonly sizeM: readonly [number, number] }
    /** The geometry carries NO `uv` attribute. Maps MUST NOT be attached. */
    | { readonly kind: 'none' };

/** Convenience: the metre-UV space, which is what a correctly-built surface has. */
export const UV_METRES: SurfaceUvSpace = { kind: 'metres' };
/** Convenience: a surface that carries no UVs at all. */
export const UV_NONE: SurfaceUvSpace = { kind: 'none' };

/**
 * `geometry.userData` key carrying the uv space a builder DECLARED.
 *
 * ⭐ WHY A DECLARED STAMP AND NOT A HEURISTIC. Several consumers re-material a
 * mesh they did not build — `initUI`'s visual-style sweep and the property
 * inspector both `traverse()` the scene and swap materials onto arbitrary
 * geometry. They cannot inspect a `uv` attribute and know whether its numbers are
 * metres or 0..1; both are just floats, and guessing from the bounding box would
 * be a heuristic that is right until a 1 m slab makes the two indistinguishable.
 *
 * So the BUILDER — the only party that knows — says so, once, at construction.
 * Absent stamp means "not declared", which resolves to `UV_NONE` and REFUSES the
 * maps. That default is what makes this safe to roll out one builder at a time:
 * a surface lights up the moment its builder emits metre UVs and stamps them,
 * and every un-migrated surface keeps rendering its honest flat colour instead of
 * a wrongly-scaled pattern (§L-1703).
 */
export const UV_SPACE_USERDATA_KEY = 'pryzmUvSpace';

/** Minimal structural view of a geometry, so this file needs no BufferGeometry import shape. */
interface UvStampable {
    userData?: Record<string, unknown>;
}

/**
 * Declare that this geometry's `uv` attribute is in METRES.
 *
 * Call it in the SAME function that writes the `uv` attribute — a stamp written
 * anywhere else is a claim about code somebody may later change.
 */
export function stampMetreUvs(geometry: UvStampable): void {
    if (!geometry.userData) geometry.userData = {};
    geometry.userData[UV_SPACE_USERDATA_KEY] = 'metres';
}

/**
 * The uv space a geometry DECLARED, or `UV_NONE` when it declared nothing.
 *
 * ⛔ `UV_NONE` here means "undeclared", and it deliberately produces the same
 * refusal as "genuinely has no uv attribute". Both are cases where attaching a
 * scaled map would be a guess, and C100 §5's rule is that a guess must not be
 * indistinguishable from an answer.
 */
export function uvSpaceOfGeometry(geometry: UvStampable | null | undefined): SurfaceUvSpace {
    if (geometry?.userData?.[UV_SPACE_USERDATA_KEY] === 'metres') return UV_METRES;
    return UV_NONE;
}

/**
 * The repeat that renders `tiling` at TRUE REAL-WORLD SCALE on a surface in
 * `uvSpace`. Pure; the single arithmetic answer, so no call site derives its own.
 *
 * - metres: `uv` already counts metres, so one repetition must span
 *   `realWorldSizeM` metres of uv -> `repeat = 1 / realWorldSizeM`. ⭐ Note this
 *   is INDEPENDENT of the surface's size, which is what makes the texture
 *   shareable and what makes a 600 mm tile stay 600 mm on a 3 m and a 12 m wall.
 * - unit: `uv` spans the whole surface, so the surface must be divided into
 *   `sizeM / realWorldSizeM` repetitions.
 * - none: there is no correct answer; `null` says so.
 */
export function deriveTextureRepeat(
    tiling: MaterialTiling,
    uvSpace: SurfaceUvSpace,
): readonly [number, number] | null {
    if (!isUsableTiling(tiling)) return null;
    const [tw, th] = tiling.realWorldSizeM;
    switch (uvSpace.kind) {
        case 'metres':
            return [1 / tw, 1 / th];
        case 'unit': {
            const [sw, sh] = uvSpace.sizeM;
            if (!Number.isFinite(sw) || !Number.isFinite(sh) || sw <= 0 || sh <= 0) return null;
            return [sw / tw, sh / th];
        }
        case 'none':
            return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADER REGISTRY — keyed by file extension.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A loader for one asset format. Mirrors `THREE.Loader.load`'s shape so
 * `TextureLoader`, and any future addon loader, satisfy it without a wrapper.
 *
 * ⚠ It returns the `THREE.Texture` SYNCHRONOUSLY, with its pixels arriving later
 * — that is `TextureLoader`'s documented behaviour and it is load-bearing here.
 * It means a builder gets a usable texture handle on the frame it asks, so no
 * rebuild has to be scheduled when the image lands; THREE uploads it on the next
 * render. That deliberately sidesteps §THREE-INVALIDATION-GATES-IN-SERIES: a
 * value that never changes identity cannot be missed by a cache key.
 */
export type TextureLoaderFn = (
    url: string,
    onLoad: (t: THREE.Texture) => void,
    onError: (reason: string) => void,
) => THREE.Texture;

/**
 * Raster formats every browser decodes natively, and the only formats this repo
 * can load TODAY.
 *
 * ⛔ `.ktx2` IS NOT HERE, AND THE REASON IS A DECODER GAP, NOT A DELIVERY GAP —
 * a distinction that misled two lanes today. `.ktx2` IS on the proxy's
 * `CATALOG_ALLOWED_EXT` and R2 will serve it, which reads like end-to-end
 * support. Measured (lane MAT-2, 2026-08-21): ZERO `KTX2Loader` references in
 * `src`, no re-export in `packages/renderer-three/src/addons/`, no Basis
 * transcoder in `public/`, and `packages/persistence-client/src/codec/ktx2.ts` is
 * a stub that "returns the input unchanged". We can DELIVER a `.ktx2` and cannot
 * DECODE one. Registering a loader that cannot transcode would mint a channel
 * whose only possible value is "broken" — C100 §10.6's own MUST NOT. So a
 * `.ktx2` path produces a NAMED `no-loader` reason, and WEBP is the shipping
 * format (MAT-2's pipeline emits KTX2 as a second output the day a decoder
 * exists).
 */
const RASTER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif'] as const;

const LOADERS = new Map<string, TextureLoaderFn>();

let _rasterLoader: THREE.TextureLoader | null = null;
function rasterLoader(): THREE.TextureLoader {
    // Lazy: constructing a TextureLoader touches THREE's LoadingManager, and this
    // module is imported by headless tests that never load an image.
    _rasterLoader ??= new THREE.TextureLoader();
    return _rasterLoader;
}

for (const ext of RASTER_EXTENSIONS) {
    LOADERS.set(ext, (url, onLoad, onError) =>
        rasterLoader().load(
            url,
            (t) => onLoad(t),
            undefined,
            () => onError(`the request for '${url}' failed (404, CORS, or decode error)`),
        ),
    );
}

/**
 * Register a loader for one file extension (lower-case, leading dot).
 *
 * ⭐ THIS IS THE SEAM SIBLING LANES PLUG INTO, and it exists because raster
 * loading — its only registrant today — already flows through it. It is not an
 * empty channel awaiting a consumer (C67 rule 18.a): remove the registrations
 * above and nothing loads.
 *
 * - lane MAT-2 registers `.ktx2` once the KTX2Loader addon and the Basis
 *   transcoder are deployed.
 * - A PROCEDURAL source is NOT expressible here, and never will be: an extension
 *   is a property of a FILE, and a generated texture has no file. It forks
 *   AHEAD of this registry on `isProceduralId` — see `acquireTexture`. That
 *   branch was RESERVED and deliberately unwritten while it had no generator
 *   behind it (a scheme with no generator is the authored-but-unwired defect
 *   this repo keeps producing); `@pryzm/procedural-textures` landed with 24
 *   generators, so it is written now, WITH its consumer, exactly as the
 *   reservation said it would be.
 */
export function registerTextureLoader(extension: string, loader: TextureLoaderFn): void {
    LOADERS.set(extension.toLowerCase(), loader);
}

/** The extensions that can be loaded right now. For diagnostics and for tests. */
export function supportedTextureExtensions(): readonly string[] {
    return [...LOADERS.keys()].sort();
}

function extensionOf(path: string): string {
    const q = path.split(/[?#]/)[0] ?? path;
    const dot = q.lastIndexOf('.');
    const slash = Math.max(q.lastIndexOf('/'), q.lastIndexOf('\\'));
    return dot > slash ? q.slice(dot).toLowerCase() : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTICS — C100 §5, deduplicated per PATH, never per element.
// ─────────────────────────────────────────────────────────────────────────────

/** Why one map channel is not on the material. Always names the path. */
export interface TextureUnavailable {
    readonly channel: MaterialMapChannel;
    /** The LOGICAL path, as authored on the record. */
    readonly path: string;
    readonly reason: string;
}

const _failures = new Map<string, string>();

/**
 * Every distinct map path that has failed, with its reason. C100 §5's
 * *"emitted once per distinct id, never once per element: a hundred walls must
 * not produce a hundred lines"*, applied to paths.
 */
export function materialTextureDiagnostics(): ReadonlyArray<{ path: string; reason: string }> {
    return [..._failures.entries()].map(([path, reason]) => ({ path, reason }));
}

/** Clear the diagnostics ledger. Tests, and a project switch. */
export function clearMaterialTextureDiagnostics(): void {
    _failures.clear();
}

function recordFailure(path: string, reason: string): void {
    if (_failures.has(path)) return;
    _failures.set(path, reason);
    // eslint-disable-next-line no-console
    console.warn(
        `[§MATERIAL-MAPS-AND-TILING] texture map '${path}' could not be loaded — ${reason}. ` +
            'The material still renders from its base colour; the PATTERN is missing (C100 §5).',
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// THE TEXTURE CACHE
// ─────────────────────────────────────────────────────────────────────────────

const _textures = new Map<string, THREE.Texture>();

/**
 * The SOURCE-owning textures, keyed `source|channel|colourSpace` — WITHOUT
 * `repeat` or `rotation`.
 *
 * ⭐ §PROCEDURAL-COST (L-1821). `repeat` and `rotation` are properties of the
 * `THREE.Texture` OBJECT, not of the pixels behind it. Folding them into the one
 * cache key meant that asking for the same map at a second scale re-did the
 * EXPENSIVE half — a second HTTP fetch for a file-backed map, and a second full
 * rasterisation for a procedural one — to produce pixels byte-identical to the
 * ones already in memory.
 *
 * So the cache is two levels now: this one owns the pixels (one fetch, one
 * generation, one GPU `Source`), and `_textures` holds a cheap per-scale VIEW
 * obtained with `.clone()`. A clone shares `.source` by reference, so the image
 * that arrives late still reaches every view, and THREE uploads the source once.
 */
const _textureSources = new Map<string, THREE.Texture>();

/**
 * A per-scale VIEW of an already-owned texture.
 *
 * ⛔ Cloning rather than mutating is the whole correctness property: two surfaces
 * wanting the same product at different real-world scales need two DIFFERENT
 * `repeat` values on two DIFFERENT texture objects. Sharing one object and
 * overwriting `repeat` would make the last caller win and silently rescale
 * everything drawn before it.
 */
function viewOfTexture(
    base: THREE.Texture,
    key: string,
    repeat: readonly [number, number],
    rotationRad: number,
): THREE.Texture {
    const cached = _textures.get(key);
    if (cached) return cached;

    const texture = base.clone();
    texture.repeat.set(repeat[0], repeat[1]);
    if (rotationRad !== 0) {
        // Rotate about the CENTRE of one repetition, not the uv origin: rotating
        // about (0,0) also translates the pattern, which reads as a misalignment
        // rather than as a rotation.
        texture.center.set(0.5, 0.5);
        texture.rotation = rotationRad;
    }
    // A clone starts at version 0 with a shared `source`; bumping it here is what
    // makes an already-loaded (or already-generated) source upload for this view.
    texture.needsUpdate = true;

    _textures.set(key, texture);
    return texture;
}

/**
 * Is runtime procedural texture GENERATION enabled? ⛔ DEFAULT **OFF**.
 *
 * ⭐ §PROCEDURAL-COST (L-1820) — THE ESCAPE HATCH THE PREVIOUS DEPLOY DID NOT
 * HAVE, and the reason it had to be rolled back rather than switched off.
 *
 * Generating one pattern is **~150–830 ms of BLOCKED MAIN THREAD** (measured on a
 * fast desktop: 24 generators, 7397 ms total, mean ~308 ms, worst
 * `parquet-oak-versailles` at 829 ms and 1536²). It is synchronous, analytic,
 * per-pixel, and there is no yield in it — 1024² × 4 channels of field evaluation
 * per set. A user who applies a handful of these materials stalls the editor for
 * seconds with no progress and no cancel. The founder's demo project froze.
 *
 * With the flag OFF the fork returns a NAMED `unavailable` (C100 §5) and the
 * material renders its AUTHORED base colour — which for these rows is the
 * generator's own `surface.faceColor`, e.g. `#c8a96e` for oak herringbone. So the
 * degradation is "a wood-coloured floor instead of a parquet-patterned one",
 * never a white plane and never a hang.
 *
 * ⚠ THE MACHINERY IS INTACT, NOT REMOVED. `globalThis.__pryzmProceduralTexturesV1
 * = true` turns it on for a session, which is how the patterns are demonstrated
 * and how the tests drive it. The REAL fix is build-time generation published as
 * ordinary file-backed WebP maps (see the lane report): that makes the runtime
 * cost zero, at which point this switch stops mattering and can be deleted.
 */
export function isProceduralTextureGenerationEnabled(): boolean {
    const g = globalThis as { __pryzmProceduralTexturesV1?: boolean };
    return g.__pryzmProceduralTexturesV1 === true;
}

function colourSpaceFor(channel: MaterialMapChannel): string {
    // ⭐ The single most common PBR defect is a data map decoded as sRGB (or an
    // albedo decoded as linear). L0 owns the classification (`SRGB_MAP_CHANNELS`)
    // so the catalogue cannot author it wrong and this adapter cannot disagree
    // with the gate about it.
    return SRGB_MAP_CHANNELS.includes(channel) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
}

/**
 * Get (or create) the shared texture for one channel at one scale.
 *
 * Returns `null` when the format has no loader — a SYNCHRONOUS refusal, distinct
 * from an asynchronous load failure, which surfaces through the diagnostics
 * ledger while the texture handle still exists.
 */
function acquireTexture(
    logicalPath: string,
    channel: MaterialMapChannel,
    repeat: readonly [number, number],
    rotationRad: number,
): { texture: THREE.Texture } | { unavailable: string } {
    // ⭐ THE PROCEDURAL FORK, ahead of everything file-shaped. A generated pattern
    // has no URL, no extension and no bucket, so none of the checks below apply
    // to it — and none of them would be MEANINGFUL applied to it. Zero assets
    // means zero hosting risk: this arm cannot 404, cannot fail CORS and cannot
    // be blocked on a decoder, which is why 24 parquet and tile patterns are
    // reachable today while the file-shaped ones depend on a bucket.
    if (isProceduralId(logicalPath)) {
        return acquireProceduralTexture(logicalPath, channel, repeat, rotationRad);
    }

    // ⛔ A path outside the catalogue prefix is returned UNCHANGED by the rewriter
    // — the "this is a drag payload, not a catalogue asset" branch — so in a
    // rehosted build it never reaches the CDN and 404s at fetch time. That failure
    // is invisible: a 404 and a slow load look identical for one frame, and the
    // map simply never appears. Named here instead, BEFORE any request. (Found by
    // lane MAT-2 running this seam against a real path; this file's own example
    // was one of the paths that would have 404'd.)
    if (isCatalogRehosted() && !logicalPath.startsWith(CATALOG_LOGICAL_PREFIX)) {
        return {
            unavailable:
                `'${logicalPath}' is outside the catalogue prefix '${CATALOG_LOGICAL_PREFIX}', so the ` +
                'object-storage rewriter passes it through unchanged and it cannot reach the CDN',
        };
    }

    const ext = extensionOf(logicalPath);
    const loader = LOADERS.get(ext);
    if (!loader) {
        return {
            unavailable:
                ext === ''
                    ? `'${logicalPath}' has no file extension, so no loader can be chosen`
                    : `no loader is registered for '${ext}' (supported: ${supportedTextureExtensions().join(', ') || 'none'})`,
        };
    }

    const colourSpace = colourSpaceFor(channel);
    const key = `${logicalPath}|${colourSpace}|${repeat[0]}|${repeat[1]}|${rotationRad}`;
    const cached = _textures.get(key);
    if (cached) return { texture: cached };

    // §PROCEDURAL-COST (L-1821) — the SOURCE is keyed WITHOUT repeat/rotation, so
    // a second surface asking for the same map at a different real-world scale
    // reuses the ONE fetch instead of issuing a second request for identical bytes.
    const sourceKey = `${logicalPath}|${channel}|${colourSpace}`;
    let base = _textureSources.get(sourceKey);
    if (!base) {
        // ⛔ The URL is composed HERE and nowhere else — the record keeps its logical
        // path so a persisted project survives a bucket move (L-570).
        const url = resolveCatalogAssetUrl(logicalPath);

        base = loader(
            url,
            (t) => {
                // The image landed. THREE sets needsUpdate itself; re-asserting the
                // sampler state is cheap and guards a loader that replaces the object.
                t.needsUpdate = true;
            },
            (reason) => recordFailure(logicalPath, reason),
        );

        base.wrapS = THREE.RepeatWrapping;
        base.wrapT = THREE.RepeatWrapping;
        base.colorSpace = colourSpace;
        base.name = `${logicalPath} @${channel}`;
        _textureSources.set(sourceKey, base);
    }

    return { texture: viewOfTexture(base, key, repeat, rotationRad) };
}

/**
 * The channel names `@pryzm/procedural-textures` emits, mapped to ours.
 *
 * ⚠ ITS `albedo` IS OUR `color`, AND THAT IS THE ONLY DIFFERENCE. Both names are
 * standard; neither is wrong. The mapping is stated ONCE, here, rather than each
 * call site knowing both vocabularies — which is how a rival vocabulary starts.
 * A channel absent from this table is one the generators do not produce
 * (`metalness`, `ao`, `displacement`): a NAMED refusal, never a blank texture.
 */
const PROCEDURAL_CHANNEL: Partial<Record<MaterialMapChannel, 'albedo' | 'normal' | 'roughness'>> = {
    color: 'albedo',
    normal: 'normal',
    roughness: 'roughness',
};

/**
 * Rasterise one channel of a procedural generator into a `THREE.DataTexture`.
 *
 * ⚠ `DataTexture`, not `TextureLoader`: the pixels already exist as an
 * `Uint8ClampedArray`, so there is nothing to fetch or decode. That also makes
 * this arm SYNCHRONOUS end to end — the texture is complete on the frame it is
 * asked for, where a file-backed one is a handle whose pixels arrive later.
 *
 * ⚠ `flipY = false`. `DataTexture` defaults to it, and the generators rasterise
 * in the same top-left origin the uv convention here expects; flipping would
 * mirror a herringbone, which reads as a laying error rather than as a bug.
 */
function acquireProceduralTexture(
    generatorId: string,
    channel: MaterialMapChannel,
    repeat: readonly [number, number],
    rotationRad: number,
): { texture: THREE.Texture } | { unavailable: string } {
    const wanted = PROCEDURAL_CHANNEL[channel];
    if (!wanted) {
        return {
            unavailable:
                `generator '${generatorId}' produces albedo, normal and roughness only — ` +
                `there is no '${channel}' channel to generate`,
        };
    }

    const colourSpace = colourSpaceFor(channel);
    const key = `${generatorId}|${channel}|${colourSpace}|${repeat[0]}|${repeat[1]}|${rotationRad}`;
    const cached = _textures.get(key);
    if (cached) return { texture: cached };

    // §PROCEDURAL-COST (L-1820) — the cost gate, and it sits AFTER the view cache
    // so a texture already generated this session keeps working if the flag is
    // turned off mid-session, and BEFORE `getProceduralTexture`, which is the call
    // that blocks the main thread for ~150–830 ms.
    if (!isProceduralTextureGenerationEnabled()) {
        return {
            unavailable:
                `'${generatorId}' is a RUNTIME-GENERATED pattern and runtime generation is ` +
                'DISABLED by default (§PROCEDURAL-COST L-1820): rasterising one set blocks the ' +
                'main thread for ~150–830 ms, which froze the editor. The material renders its ' +
                'authored base colour instead. Set `globalThis.__pryzmProceduralTexturesV1 = ' +
                'true` to generate anyway.',
        };
    }

    // The pixels are keyed WITHOUT repeat/rotation — those live on the texture
    // object, not in the bitmap, and generating a second identical set to carry a
    // different `repeat` is the expensive half done for nothing.
    const sourceKey = `${generatorId}|${channel}|${colourSpace}`;
    let base = _textureSources.get(sourceKey);
    if (!base) {
        const set = getProceduralTexture(generatorId);
        if (!set) {
            // Unreachable while `isProceduralId` gates the fork, but a generator list
            // that changed under us must be a NAMED state, not an exception.
            return { unavailable: `'${generatorId}' is not a known procedural generator` };
        }
        const map = set[wanted];
        base = new THREE.DataTexture(map.data, map.width, map.height, THREE.RGBAFormat);
        base.flipY = false;
        base.wrapS = THREE.RepeatWrapping;
        base.wrapT = THREE.RepeatWrapping;
        base.colorSpace = colourSpace;
        base.generateMipmaps = true;
        base.minFilter = THREE.LinearMipmapLinearFilter;
        base.magFilter = THREE.LinearFilter;
        base.name = `${generatorId} @${channel}`;
        base.needsUpdate = true;
        _textureSources.set(sourceKey, base);
    }

    return { texture: viewOfTexture(base, key, repeat, rotationRad) };
}

/**
 * Every procedural generator this build can rasterise, for a picker or a probe.
 * Re-exported so a UI needs one import rather than two vocabularies.
 */
export { describeProceduralGenerator, isProceduralId };

/** The THREE textures for one material, by channel. Shared, never per element. */
export type MaterialTextureSet = {
    readonly [K in MaterialMapChannel]?: THREE.Texture;
};

/**
 * The FOUR distinguishable outcomes of asking a material for its textures.
 *
 * ⭐ They are four states and not a nullable texture set on purpose. C84 EI-1b:
 * "this material has no maps" and "this material's maps are broken" must never
 * be the same value, and a caller that collapses them is doing so visibly.
 */
export type MaterialTextureResolution =
    /** The material declares no map channels. Not a failure — most materials. */
    | { readonly state: 'no-maps' }
    /** The record is mis-authored (maps without a usable tiling). Named, never silent. */
    | { readonly state: 'invalid'; readonly reason: string }
    /** The SURFACE cannot carry maps (no uv attribute). The material is fine. */
    | { readonly state: 'no-uvs'; readonly reason: string }
    /** At least the arithmetic worked. `unavailable` may still list refused channels. */
    | {
          readonly state: 'resolved';
          readonly textures: MaterialTextureSet;
          readonly repeat: readonly [number, number];
          readonly rotationRad: number;
          readonly requested: readonly MaterialMapChannel[];
          readonly unavailable: readonly TextureUnavailable[];
      };

/** The material subset the resolver reads. Structural, so records, projections
 *  and test literals all satisfy it without a cast. */
export interface MapBearingMaterial {
    readonly id: string;
    readonly maps?: MaterialMaps;
    readonly tiling?: MaterialTiling;
}

/**
 * The shape a builder's INJECTED material map must carry.
 *
 * ⛔ THERE WERE SIX HAND-WRITTEN COPIES OF THIS SHAPE, and every one of them
 * declared a dead `textures?: { color?: unknown; normal?: unknown; roughness?:
 * unknown }` — the field C100 §10.6 measured as read at seven sites and written
 * by nothing. Six copies of one structural type is the same defect C100 §1.1
 * traces for material VALUES, one level up in the type system: they were written
 * to avoid importing a shared name, and they all drifted to the same wrong thing
 * at once. One name now, and `unknown` is gone with it — the builders' material
 * paths were untyped, which is part of why a field nothing wrote type-checked
 * everywhere for months.
 *
 * `params` stays `Record<string, unknown>` rather than
 * `MeshStandardMaterialParameters`, because these declarations sit in packages
 * that deliberately do not name THREE types in their public surface.
 */
export interface BuilderMaterialDef extends MapBearingMaterial {
    readonly params?: Record<string, unknown>;
}

/**
 * SPEC-MATERIALS-REPOSITORY §3.2's resolver: a material record plus the surface's
 * uv space in, shared `THREE.Texture` objects out, at true real-world scale.
 */
export function resolveMaterialTextures(
    material: MapBearingMaterial,
    uvSpace: SurfaceUvSpace,
    /**
     * Restrict resolution to these channels. ⭐ NOT an optimisation flag — it is
     * how the adapter avoids DOWNLOADING what it cannot bind. A real ambientCG
     * material ships `ao` and `displacement` (~1.5 MB of WebP between them) and
     * this renderer can bind NEITHER: `aoMap` samples THREE's `uv1`, which no
     * geometry here emits, and `displacementMap` needs a tessellated surface.
     * Fetching them would be pure waste on every material. The RECORD still
     * declares them, because the product genuinely has them and the day a second
     * uv set exists they must not need re-authoring.
     */
    channels: readonly MaterialMapChannel[] = MATERIAL_MAP_CHANNELS,
): MaterialTextureResolution {
    const maps = material.maps;
    if (!hasAnyMap(maps)) return { state: 'no-maps' };

    const defect = materialMapsDefect(material);
    if (defect) return { state: 'invalid', reason: defect };

    // `materialMapsDefect` returning null with maps present guarantees a usable
    // tiling; the check keeps the narrowing honest rather than asserting it.
    const tiling = material.tiling;
    if (!isUsableTiling(tiling)) {
        return { state: 'invalid', reason: `material '${material.id}' has no usable tiling` };
    }

    const repeat = deriveTextureRepeat(tiling, uvSpace);
    if (!repeat) {
        return {
            state: 'no-uvs',
            reason:
                uvSpace.kind === 'none'
                    ? `material '${material.id}' has maps, but this surface carries no uv attribute — ` +
                      'attaching a map would paint the whole surface with texel (0,0), which is ' +
                      'neither the pattern nor the base colour (§L-1703)'
                    : `material '${material.id}' has maps, but the surface size given for its unit uv space is unusable`,
        };
    }

    const rotationRad = ((tiling.rotationDeg ?? 0) * Math.PI) / 180;

    const textures: { -readonly [K in MaterialMapChannel]?: THREE.Texture } = {};
    const requested: MaterialMapChannel[] = [];
    const unavailable: TextureUnavailable[] = [];

    for (const channel of channels) {
        const path = maps?.[channel];
        if (!path) continue;
        requested.push(channel);
        const got = acquireTexture(path, channel, repeat, rotationRad);
        if ('texture' in got) textures[channel] = got.texture;
        else {
            unavailable.push({ channel, path, reason: got.unavailable });
            recordFailure(path, got.unavailable);
        }
    }

    return { state: 'resolved', textures, repeat, rotationRad, requested, unavailable };
}

/**
 * Dispose every cached texture and empty the cache.
 *
 * ⚠ The cache is the OWNER of these objects — a material definition only holds a
 * reference. So disposal belongs here, and `disposeLibraryTextures()` delegates
 * rather than walking the library (walking it would re-resolve a lazily-projected
 * texture set in order to destroy it, which is how a dispose helper ends up
 * loading images).
 */
export function disposeMaterialTextures(): void {
    for (const t of _textures.values()) t.dispose();
    _textures.clear();
    // §PROCEDURAL-COST (L-1821) — the per-scale views share their `source` with the
    // owning texture here, so the views' `dispose()` alone would leave the GPU
    // source (and, for a generated pattern, a 4 MB buffer) reachable and unfreed.
    for (const t of _textureSources.values()) t.dispose();
    _textureSources.clear();
}

/** Number of live cached textures. For the instancing/memory assertions. */
export function materialTextureCacheSize(): number {
    return _textures.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ADAPTER — the ONE place maps are attached to a THREE material.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `MeshStandardMaterialParameters` keys this adapter writes.
 *
 * ⚠ Every slot is `Texture | null | undefined` so a real
 * `THREE.MeshStandardMaterialParameters` satisfies it structurally — THREE
 * declares these as nullable, and narrowing them here would force every call
 * site to cast, which is how an `any` seam gets written into a typed adapter.
 */
/**
 * The channels `applyMaterialMaps` can actually bind to a `MeshStandardMaterial`
 * on the geometry this repository produces. Anything outside this list is
 * declared on the record and deliberately not fetched — see the `channels`
 * parameter of `resolveMaterialTextures`.
 */
export const BINDABLE_CHANNELS: readonly MaterialMapChannel[] = [
    'color', 'normal', 'roughness', 'metalness',
];

export type MaterialMapParams = {
    map?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
};

/**
 * Attach a material's texture maps to a `MeshStandardMaterialParameters` object,
 * at true real-world scale for `uvSpace`.
 *
 * ⭐ Every builder that wants a pattern calls THIS, and passes the uv space its
 * own geometry actually has. That is the whole safety property: a builder cannot
 * attach a map without stating, in the same expression, what its UVs mean — and
 * a builder whose geometry has none says `UV_NONE` and correctly gets nothing.
 * C100 §3's review test applies: rename or recolour a material and this file
 * needs no edit, so it is an adapter, not a duplicate.
 *
 * ⛔ `ao` and `displacement` are RESOLVED but NOT ATTACHED, and the gap is named
 * rather than papered over: `aoMap` samples THREE's `uv1` attribute, which NO
 * geometry in this repository emits (measured: zero `uv1`/`uv2` occurrences
 * outside node_modules), so attaching one would sample texel (0,0) — the exact
 * defect `UV_NONE` exists to refuse. `displacementMap` needs a tessellated
 * surface and every wall/slab body here is flat-shaded at 2 triangles per face.
 * Both become real when a second uv set and tessellation exist; until then they
 * are authored on the record for the assets to carry and deliberately unbound.
 *
 * @returns the resolution, so the caller can report a NAMED state (C100 §5)
 *          instead of silently rendering a material with no pattern.
 */
export function applyMaterialMaps(
    params: MaterialMapParams,
    material: MapBearingMaterial,
    uvSpace: SurfaceUvSpace,
): MaterialTextureResolution {
    const res = resolveMaterialTextures(material, uvSpace, BINDABLE_CHANNELS);
    if (res.state !== 'resolved') return res;
    const t = res.textures;
    if (t.color) params.map = t.color;
    if (t.normal) params.normalMap = t.normal;
    if (t.roughness) params.roughnessMap = t.roughness;
    if (t.metalness) params.metalnessMap = t.metalness;
    return res;
}
