// SectionStore — pure DTO store for section elements (W-09 recipe).
//
// Wave 12 recipe completion: section-view plugin store.ts (previously missing).
//
// Sections are plan-view-visible cutting planes defined by a 2D line
// (a, b) and a look-depth. The store mirrors SectionData from plugin-sdk.
//
// All imports from @pryzm/plugin-sdk only (L8 boundary rule).

import { Store } from '@pryzm/plugin-sdk';
import type { SectionData } from '@pryzm/plugin-sdk';

export type { SectionData };
export type SectionId = string;
export type SectionsState = Record<string, SectionData>;

/**
 * SectionStore holds all section-cut DTOs for the current project.
 *
 * Handlers (CreateSection, DeleteSection, etc.) receive
 * ctx.stores.section (typed to SectionsState) and produce patches.
 * This store provides convenience methods for the renderer.
 */
export class SectionStore extends Store<SectionData> {
  constructor() {
    super('section');
  }

  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  get(id: string): Readonly<SectionData> | undefined {
    return this.state.get(id);
  }

  all(): readonly SectionData[] {
    return [...this.state.values()];
  }

  /** Find sections whose mark string matches. */
  byMark(mark: string): readonly SectionData[] {
    const out: SectionData[] = [];
    for (const s of this.state.values()) {
      if (s.mark === mark) out.push(s);
    }
    return out;
  }
}
