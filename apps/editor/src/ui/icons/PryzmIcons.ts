/**
 * PryzmIcons.ts
 *
 * Barrel re-export for the PRYZM architectural icon library.
 * Split into sub-modules (WS-B S85-WIRE) to keep each file under 1,200 LOC.
 *
 * Sub-modules:
 *   PryzmIconsBasic   — structural/tool-mode/landscape icons
 *   PryzmIconsPryzm   — pryzm-branded panel/category icons
 *   PryzmIconsSystem  — material-symbols map + iconFromName/iconEl helpers
 *
 * All existing imports continue to work unchanged:
 *   import * as PryzmIcons from './icons/PryzmIcons';
 *   import { wall, sofa, iconFromName } from './icons/PryzmIcons';
 */

export * from './PryzmIconsBasic';
export * from './PryzmIconsPryzm';
export * from './PryzmIconsSystem';
