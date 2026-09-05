/**
 * §ANN-SEED — five demo annotations for a project that has none.
 *
 * Founder: "IF THERE IS NO DATA CREATE 5 WITH DIFFERENT TEXT SIZES AND MAYBE DIFFERENT
 * COLOURS". An empty annotation subsystem is untestable — a user cannot tell "no
 * annotations exist" from "annotations exist but do not render", which is the exact
 * confusion that let the two-store defect survive (see the context-data-honesty rule:
 * failure and empty must not be the same value).
 *
 * The five sizes and colours are NOT invented here: they are the five built-in
 * `AnnotationSystemType`s (§ANN-TYPE). One definition, two uses — so the seed is also a
 * live demonstration of the type system, and changing a type changes the demo.
 *
 * SAFETY. This creates data in a user's project, so it is deliberately narrow:
 *   • it runs ONLY when the canonical store is completely empty;
 *   • it goes through the same `annotation.create` bus verb a tool uses (C03 §P6, via
 *     §ANN-ONE-STORE's rich-payload passthrough), so each seeded annotation is undoable,
 *     redoable and deletable like any other;
 *   • it reports what it did — `{ created, reason }` — and never claims success when it
 *     created nothing (ADR-0299 §RECOVERY-MUST-REFUSE).
 *
 * Contract compliance:
 *   C03 §P6     — commands are the only mutation path; no direct store write here.
 *   C10 §2 / P8 — opens `annotation.seed`.
 */

import { withHandlerSpan, createId } from '@pryzm/plugin-sdk';
import { annotationStore } from './AnnotationStore.js';
import { BUILT_IN_ANNOTATION_TYPES } from './AnnotationSystemTypeStore.js';
import { makeAnnotationElement } from './AnnotationTypes.js';


export interface SeedOutcome {
  readonly created: number;
  /** Always populated when `created === 0`, so a no-op is never mistaken for a success. */
  readonly reason?: string;
}

/** Where the five demo notes are placed, in world XZ metres — a readable column. */
const SEED_LAYOUT: readonly { x: number; z: number; text: string }[] = [
  { x: 0, z: -6, text: 'TITLE — 5.0 mm' },
  { x: 0, z: -4, text: 'REVISION — 4.0 mm' },
  { x: 0, z: -2, text: 'NOTE — 3.5 mm' },
  { x: 0, z:  0, text: 'DIMENSION — 2.5 mm' },
  { x: 0, z:  2, text: 'TAG — 2.0 mm' },
];

/**
 * Seed five demo annotations into `viewId` when the project has none.
 *
 * @returns how many were created and, when none were, why.
 * P8: opens `annotation.seed`.
 */
export function seedDemoAnnotations(viewId: string): SeedOutcome {
  return withHandlerSpan('annotation.seed', { 'pryzm.view.id': viewId }, () => {
    if (!viewId) return { created: 0, reason: 'no owning view — seed skipped' };
    if (annotationStore.count > 0) {
      return { created: 0, reason: `project already has ${annotationStore.count} annotation(s)` };
    }
    const bus = typeof window !== 'undefined' ? window.runtime?.bus : undefined;
    if (!bus || typeof bus.executeCommand !== 'function') {
      return { created: 0, reason: 'command system not ready — seed skipped' };
    }

    let created = 0;
    const failures: string[] = [];
    for (let i = 0; i < SEED_LAYOUT.length; i++) {
      const slot = SEED_LAYOUT[i]!;
      const type = BUILT_IN_ANNOTATION_TYPES[i]!;
      const el = makeAnnotationElement(
        createId('annotation'),
        'text-note',
        viewId,
        [],
        { modelPoints: [{ x: slot.x, y: 0, z: slot.z }], offset: 0 },
        { text: slot.text },
        // The element carries the type's presentation explicitly as well as pointing at
        // it, so the five are visibly different even in a renderer that has not yet been
        // taught to resolve `systemTypeId`.
        { ...type.style },
        undefined,
        type.id,
      );
      try {
        // ⚠ THE POST-CONDITION IS READ FROM THE STORE, NOT FROM THE RETURN VALUE, and
        // that is what makes the sync→async move safe here. `executeCommand` returns a
        // promise, so it can no longer report success inline — but this loop never
        // trusted the return value in the first place: it asks the CANONICAL store
        // whether the element arrived. A dispatch whose write had not landed by the time
        // this line runs is therefore reported as a REFUSAL (ADR-0299
        // §RECOVERY-MUST-REFUSE), never counted as a success.
        void Promise.resolve(bus.executeCommand('annotation.create', el)).catch(
          (err: unknown) => console.warn('[§ANN-SEED] annotation.create refused:', err),
        );
        if (annotationStore.has(el.id)) created++;
        else failures.push(`${el.id} did not reach the store`);
      } catch (err) {
        failures.push(String(err));
      }
    }

    if (created === 0) {
      return { created: 0, reason: `all 5 seed annotations were refused — ${failures.join('; ')}` };
    }
    if (created < SEED_LAYOUT.length) {
      return { created, reason: `${SEED_LAYOUT.length - created} refused — ${failures.join('; ')}` };
    }
    return { created };
  });
}
