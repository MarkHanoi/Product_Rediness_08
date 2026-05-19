import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec2 } from '../base/primitives.js';

const SheetSize = z.enum(['A0', 'A1', 'A2', 'A3', 'A4', 'ARCH-D', 'ARCH-E', 'CUSTOM']);
const SheetOrientation = z.enum(['portrait', 'landscape']);

const Viewport = z.object({
  id: z.string().min(1),
  /** View id placed in this viewport. */
  viewId: z.string().min(1),
  /** Top-left corner on the sheet, in millimetres. */
  origin: Vec2,
  /** Viewport width × height on the sheet, in millimetres. */
  size: Vec2,
  /** Drawing scale (e.g. 1:50 → 0.02). */
  scale: z.number().positive().default(0.02),
});

/**
 * Sheet — a printable composition of viewports and annotations at fixed scale.
 */
export const Sheet = defineElement('sheet', {
  /** Sheet number / identifier (e.g. "A101"). */
  number: z.string().default('A100'),
  title: z.string().default('Untitled'),
  size: SheetSize.default('A1'),
  orientation: SheetOrientation.default('landscape'),
  /** Custom dimensions in millimetres; required when size === 'CUSTOM'. */
  customSize: Vec2.optional(),
  viewports: z.array(Viewport).default([]),
  /** Title-block template id. */
  titleBlockId: z.string().optional(),
  /** Revision label, e.g. "P01". */
  revision: z.string().optional(),
}).refine(
  (s) => s.size !== 'CUSTOM' || s.customSize !== undefined,
  { message: 'Custom sheet size requires `customSize` (mm).' },
);

export type Sheet = z.infer<typeof Sheet>;
