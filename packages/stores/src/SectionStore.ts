// SectionStore — domain store for section views (W-09 / Phase 2C closeout).
//
// Spec: `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-09.
//
// Mirrors `SheetStore` exactly:
//   • Map<SectionId, SectionData> indexed by the section's stable id.
//   • Mutations land via `applyPatch(immerPatches)` only.
//   • Display order is the canonical `SectionData.seq` field — `list()`
//     returns sections sorted by `seq` ascending.
//   • Active-section tracking lives in the SEPARATE `ActiveSectionStore`.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// `SectionData` is intentionally narrow.  The geometry-kernel
// `produceSectionCut(line, elements)` is the only consumer of `line`;
// callers that need richer view metadata layer additional stores on top.

import { Store } from './Store.js';

export type SectionId = string;

export interface SectionData {
  readonly id: SectionId;
  /** Sheet-style human-facing mark, e.g. "1/A-201".  Optional — falls back
   *  to a synthesised "Section <seq>" in the UI when absent. */
  readonly mark?: string;
  /** Section line in world XY coords. */
  readonly line: {
    readonly a: { readonly x: number; readonly y: number };
    readonly b: { readonly x: number; readonly y: number };
    /** "Look depth" behind the section plane (m). */
    readonly lookDepth: number;
  };
  /** Drafting scale (1:scale), e.g. 50 means 1:50. */
  readonly scale: number;
  /** Display order (canonical sort key). */
  readonly seq: number;
}

export type SectionsState = Record<string, SectionData>;

export class SectionStore extends Store<SectionData> {
  constructor() { super('section'); }

  ids(): readonly SectionId[] { return [...this.state.keys()]; }

  get(id: SectionId): Readonly<SectionData> | undefined { return this.state.get(id); }

  /** All sections in canonical display order (ascending `seq`). */
  list(): ReadonlyArray<SectionData> {
    const arr = [...this.state.values()];
    arr.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
    return Object.freeze(arr);
  }

  /** Maximum `seq` value in the store, or `-1` if empty.  CreateSection
   *  uses `nextSeq() + 1` to append. */
  nextSeq(): number {
    let max = -1;
    for (const s of this.state.values()) if (s.seq > max) max = s.seq;
    return max;
  }
}
