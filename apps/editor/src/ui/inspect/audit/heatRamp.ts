/**
 * @file src/ui/inspect/audit/heatRamp.ts
 *
 * §DISCOVERY-RAMP-IS-ONE (L-1742) — the ONE definition of the Inspect panel's
 * value→colour heat ramp.
 *
 * It is a leaf module on purpose. Before this, the same encoding was written
 * out in THREE places that could not agree:
 *   • `discoveryBlueColor()`   in DiscoveryModeZone.ts   rgb(0,210,240) → rgb(0,100,200)
 *   • the `.aud-discovery-legend-swatch` gradient in CSS  rgb(168,230,240) → rgb(0,110,180)
 *   • `attributeHeatColor()`   in ElementTypeSelectorZone.ts  #ffaa00 → #00e5ff
 * The second is the LEGEND for the first and did not match it, so the panel's
 * own key was telling the user the wrong colour for the smallest room. The
 * third is a fourth palette again (amber→cyan) for the same job one panel over.
 * `DiscoveryModeZone` already imports `ElementTypeSelectorZone`, so the shared
 * definition cannot live in either without a cycle — hence this file.
 *
 * The hue is now the PRYZM brand ramp: a pale violet through #6600FF. The
 * standing palette is white + purple, and a cyan/amber scale was the loudest
 * reason the Inspect surface read as a different product (founder, 2026-08-21).
 * ⚠ Only the HUE changed. The mapping from normalised value to ramp position is
 * unchanged, so both panels report exactly what they reported before.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6) — pure arithmetic plus one custom-property write.
 */

export const DISCOVERY_RAMP = {
  /** normalisedSize 0 — the smallest / lowest value. */
  from: [216, 203, 255] as const,
  /** normalisedSize 1 — the largest / highest value. Brand accent #6600FF. */
  to:   [102,   0, 255] as const,
} as const;

/** Interpolate the brand heat ramp. Input is clamped to [0, 1]. */
export function discoveryRampColor(normalisedSize: number): string {
  const t = Math.min(1, Math.max(0, Number.isFinite(normalisedSize) ? normalisedSize : 0));
  const [r0, g0, b0] = DISCOVERY_RAMP.from;
  const [r1, g1, b1] = DISCOVERY_RAMP.to;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return `rgb(${r},${g},${b})`;
}

/**
 * Publish the ramp endpoints onto an element as `--aud-ramp-from` /
 * `--aud-ramp-to`, so `.aud-discovery-legend-swatch` paints the SAME gradient
 * the swatches use rather than a second, hand-written copy of it.
 */
export function publishDiscoveryRamp(host: HTMLElement): void {
  host.style.setProperty('--aud-ramp-from', discoveryRampColor(0));
  host.style.setProperty('--aud-ramp-to',   discoveryRampColor(1));
}
