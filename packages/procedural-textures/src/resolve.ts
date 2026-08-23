// §PROCEDURAL-PATTERNS (L-1800) — THE SEAM A MATERIAL RESOLVER PLUGS INTO.
//
// ─── Why this file exists, and what it deliberately does NOT do ───────────────
// C100 §10.2.c queues `maps?: { albedo, normal, roughness, ao, metalness }` and
// `tiling?: { repeatX, repeatY, rotation }` onto `MaterialRecord`, and §10.7 S28
// BLOCKS them on asset hosting (§10.6: no bucket, no loader, no licence). A map
// source that is a GENERATOR ID rather than a path is not blocked on any of that —
// there is nothing to host.
//
// ⭐ C67 rule 18.a forbids authoring a channel with no consumer. This package is the
// CONSUMER side of that seam: it answers the two questions a resolver has to ask —
//   (1) "is this map source generated?"       → `isProceduralId`
//   (2) "how big is one tile of it, in metres?" → `describeProceduralGenerator`
// — and (2) is answerable WITHOUT rasterising, which matters because a catalogue
// load, a schedule and an IFC export all need the scale and none of them want pixels.
//
// ⛔ THIS FILE MINTS NO RIVAL RESOLVER. It does not read `MaterialRecord`, does not
// import `@pryzm/schemas`, does not know what a material is. C100 §4's entire census
// is of vocabularies that were copied because the master was unreachable; the
// correct shape for a NEW capability is a function the ONE resolver calls, which is
// what this is. When MAT-1's `MaterialResolver` lands, it forks on `isProceduralId`
// and calls `getProceduralTexture` — no edit to this file is required for that.

import { generateProceduralTexture, proceduralRealWorldSizeM, type GeneratedTextureSet, type ProceduralFamily } from './generate.js';
import { findProceduralSpec, isProceduralId, PROCEDURAL_TEXTURE_SPECS } from './presets.js';

/** Everything a resolver needs about a generator BEFORE deciding to rasterise. */
export interface ProceduralDescriptor {
  readonly id: string;
  readonly label: string;
  readonly family: ProceduralFamily;
  /** Real-world size of ONE texture tile, metres. Fills `tiling.realWorldSizeM`. */
  readonly realWorldSizeM: { readonly x: number; readonly y: number };
  /** Which PBR channels this generator produces. All three, always — see generate.ts. */
  readonly channels: readonly ['albedo', 'normal', 'roughness'];
  readonly defaultResolution: number;
}

export function describeProceduralGenerator(id: string): ProceduralDescriptor | undefined {
  const spec = findProceduralSpec(id);
  if (!spec) return undefined;
  return {
    id: spec.id,
    label: spec.label,
    family: spec.family,
    realWorldSizeM: proceduralRealWorldSizeM(spec.layout),
    channels: ['albedo', 'normal', 'roughness'],
    defaultResolution: spec.defaultResolution ?? 1024,
  };
}

/**
 * The generator's scale in the EXACT SHAPE `MaterialTiling` declares at L0
 * (`packages/schemas/src/materials/materialMaps.ts`): a two-element metre tuple,
 * plus an optional rotation.
 *
 * ⭐ SHAPED TO FIT, NOT MERELY COMPATIBLE. MAT-1's field is
 * `realWorldSizeM: readonly [number, number]`, and its rule is blunt: "⛔ A record
 * carrying `maps` MUST carry a usable `tiling`", checked by
 * `tools/ga-gate/check-material-maps-tiling.ts`. Returning `{x, y}` here would have
 * forced every wiring site to transcribe the pair — and a transcription is how
 * C100 §4's six rival vocabularies got written. So the tuple is produced here,
 * once, by the party that knows the number.
 *
 * ⚠ STRUCTURAL, NOT IMPORTED. This package does not import `@pryzm/schemas` — it
 * imports nothing at all, which its own test suite asserts. TypeScript's structural
 * typing means the returned value satisfies `MaterialTiling` without a dependency
 * edge. If MAT-1 ever changes the shape, the wiring site fails to compile, which is
 * the correct place for that failure to land.
 *
 * ⛔ `rotationDeg` is deliberately NOT set. A herringbone generator emits an
 * AXIS-ALIGNED pattern; laying it at 45° is a TILING concern, and MAT-1's field
 * says so in its own docstring ("a product laid differently is not a different
 * product"). Rotating the bitmap instead would destroy the seamlessness the whole
 * package is built to guarantee — a rotated square texture no longer wraps.
 */
export function proceduralTilingFor(
  id: string,
): { readonly realWorldSizeM: readonly [number, number] } | undefined {
  const spec = findProceduralSpec(id);
  if (!spec) return undefined;
  const size = proceduralRealWorldSizeM(spec.layout);
  return { realWorldSizeM: [size.x, size.y] as const };
}

export function listProceduralGenerators(): readonly ProceduralDescriptor[] {
  return PROCEDURAL_TEXTURE_SPECS.map((s) => describeProceduralGenerator(s.id) as ProceduralDescriptor);
}

// ─── The cache ────────────────────────────────────────────────────────────────
// ⭐ Generation is the whole per-frame cost of approach (a), and it is paid ONCE
// per (id, resolution) for the life of the process. A `Map` is the correct amount of
// machinery: the keys are bounded by the preset list, the values are plain buffers,
// and there is no I/O to make asynchronous. Anything more would be a cache with a
// lifecycle nobody asked for.
const CACHE = new Map<string, GeneratedTextureSet>();

/**
 * Generate — or return the already-generated — texture set for a generator id.
 * Returns `undefined` for an unknown id: ⛔ C100 §5's no-silent-fallback rule means
 * an unresolvable source must be VISIBLE to the caller, never quietly a white plane.
 */
export function getProceduralTexture(id: string, resolution?: number): GeneratedTextureSet | undefined {
  const spec = findProceduralSpec(id);
  if (!spec) return undefined;
  const res = resolution ?? spec.defaultResolution ?? 1024;
  const key = `${id}@${res}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const made = generateProceduralTexture(spec, res);
  CACHE.set(key, made);
  return made;
}

/** Test/diagnostic hook. Not part of the resolver contract. */
export function clearProceduralCache(): void {
  CACHE.clear();
}

export { isProceduralId };
