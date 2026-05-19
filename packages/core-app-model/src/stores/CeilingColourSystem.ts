/**
 * CeilingColourSystem — Resolves colours for ceiling geometry and plan view.
 * Pure service — no Three.js, no store writes, no window.* access.
 */

import { CeilingData, CeilingHoleSubType, CeilingLayerFunction } from './CeilingTypes';

/** Default soffit colour — off-white plaster. */
export const CEILING_SOFFIT_DEFAULT_COLOR = '#F5F5F0';

/** Default plan fill colour. */
export const CEILING_PLAN_FILL_DEFAULT_COLOR = '#E8E4DC';

/** Layer-function colour palette (used as fallback when materialColor is absent). */
export const LAYER_FUNCTION_COLORS: Record<CeilingLayerFunction, string> = {
  'structure':      '#C0C0C0',   // Concrete grey
  'air-gap':        '#D4EBF2',   // Light blue (air)
  'insulation':     '#E8D4A0',   // Mineral wool yellow
  'substrate':      '#D0C8B8',   // Light brown board
  'finish':         '#F0EEE8',   // Off-white plaster
  'suspended-grid': '#A0A0A0',   // Grid metal grey
};

/** Hole frame colour defaults by sub-type. */
const HOLE_FRAME_COLORS: Record<CeilingHoleSubType, string> = {
  'light-fixture':   '#CCCCCC',
  'hvac-diffuser':   '#EEEEEE',
  'skylight':        '#88C8FF',
  'access-hatch':    '#AAAAAA',
  'structural-beam': '#808060',
  'generic':         '#BBBBBB',
};

/** Resolve the soffit material colour for a ceiling. */
export function getSoffitColor(ceiling: CeilingData): string {
  return (
    ceiling.colour ??
    ceiling.finishSpec.soffitColor ??
    CEILING_SOFFIT_DEFAULT_COLOR
  );
}

/** Resolve the plan-fill colour for a ceiling (2D section view). */
export function getPlanFillColor(ceiling: CeilingData): string {
  return ceiling.colour ?? CEILING_PLAN_FILL_DEFAULT_COLOR;
}

/** Resolve the frame colour for a hole element. */
export function getHoleFrameColor(subType: CeilingHoleSubType): string {
  return HOLE_FRAME_COLORS[subType];
}

/** Resolve the colour for a layer by function. */
export function getLayerColor(
  fn: CeilingLayerFunction,
  materialColor?: string
): string {
  return materialColor ?? LAYER_FUNCTION_COLORS[fn];
}
