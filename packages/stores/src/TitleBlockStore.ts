// TitleBlockStore — registry of title-block templates (S38 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S38 lines
// 343–419 ("Implementation Detail — Title Block Templates").  Track A
// allocation table line 38: "`packages/stores/TitleBlockStore.ts` +
// handlers | S38".
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Mirrors `SheetStore` shape: Map<TemplateId, TitleBlockTemplate>
//   indexed by the template's stable id.
// • Read selectors only at S38 — the 3 built-in templates ('standard',
//   'architectural', 'minimal') are seeded at construction; user-defined
//   templates land via the Plugin SDK in S62 and will use the same
//   `applyPatch(immerPatches)` mutation surface as every other store.
// • The CONCRETE built-in templates live in `plugins/sheets/src/title-
//   block.ts` (keeping geometry data out of the L1 store package).
//   Callers seed the store via the constructor:
//     new TitleBlockStore({ initialTemplates: BUILTIN_TITLE_BLOCK_TEMPLATES });
// • The store is intentionally NOT marked `ephemeral` — title-block
//   template definitions are durable project state and persist via the
//   event log alongside sheets.

import { Store } from './Store.js';
import type { TitleBlockTemplate, TitleBlockTemplateId } from '@pryzm/schemas/sheet';

export type TitleBlocksState = Record<string, TitleBlockTemplate>;

export interface TitleBlockStoreOptions {
  /** Templates to seed at construction.  Idempotent — duplicate ids in
   *  the array throw `Error` so misconfiguration surfaces immediately. */
  readonly initialTemplates?: ReadonlyArray<TitleBlockTemplate>;
}

export class TitleBlockStore extends Store<TitleBlockTemplate> {
  constructor(opts: TitleBlockStoreOptions = {}) {
    super('title-block');
    if (opts.initialTemplates) {
      this.seed(opts.initialTemplates);
    }
  }

  /** All template ids in stable insertion order. */
  ids(): readonly TitleBlockTemplateId[] {
    return [...this.state.keys()];
  }

  /** Lookup by id.  `undefined` if the template is not registered. */
  get(id: TitleBlockTemplateId): Readonly<TitleBlockTemplate> | undefined {
    return this.state.get(id);
  }

  /** True iff the template is registered. */
  has(id: TitleBlockTemplateId): boolean {
    return this.state.has(id);
  }

  /** All templates in insertion order.  Returns a fresh frozen array on
   *  every call — listeners use `subscribeDirty` to know when to re-fetch. */
  list(): ReadonlyArray<TitleBlockTemplate> {
    return Object.freeze([...this.state.values()]);
  }

  /** Seed a batch of templates.  Used by the constructor and by the
   *  `attachStores` boot sequence after the store is constructed.  Throws
   *  on duplicate ids — the boot path must not silently shadow built-ins. */
  private seed(templates: ReadonlyArray<TitleBlockTemplate>): void {
    for (const t of templates) {
      if (this.state.has(t.id)) {
        throw new Error(`[TitleBlockStore] duplicate template id "${t.id}" in seed`);
      }
      this.state.set(t.id, Object.freeze({ ...t }));
    }
  }
}
