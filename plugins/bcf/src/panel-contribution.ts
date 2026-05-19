/**
 * BCF "Issues" panel contribution — surfaces the BCF topics + viewpoints
 * for the currently-selected element inside the editor's `PanelHost`.
 *
 * Phase 3-B Sprint S60 D1–D2 — paired with `viewpoint-navigator.ts` to
 * close the S59 carry items "BCF viewpoint camera-restore glue" and
 * "BCF panel contribution registered with PanelHost".
 *
 * The contribution is intentionally framework-free DOM. Rendering is a
 * single mounted `<details>` per topic that references the selected
 * element via `BCFComponent.ifcGuid`, with one `<button class="vp-jumper">`
 * per viewpoint. Click handlers compute a `CameraTarget` via
 * `viewpoint-navigator.ts` and forward it to the supplied
 * `onNavigate(target)` callback — actual camera animation is the
 * editor's responsibility (so this module stays portable to the
 * bake-worker for sanity checks).
 */

import type { PanelContribution, PanelContext } from '@pryzm/plugin-sdk';
import type { BCFArchive, BCFTopic, BCFViewpoint } from './types.js';
import {
  viewpointToCameraTarget,
  type CameraTarget,
} from './viewpoint-navigator.js';

export interface BcfPanelDeps {
  /**
   * Current archive snapshot (or null when no BCF file is open).
   * The contribution re-renders whenever the editor calls `mount(...)`,
   * so changing this between mounts is the supported reactivity surface.
   */
  readonly archive: BCFArchive | null;
  /**
   * Resolver: PRYZM element id → IFC GlobalId. Pulled from the IFC
   * meta-store. `null` when the element is not an IFC-backed element.
   */
  resolveIfcGuid(pryzmElementId: string): string | null;
  /**
   * Camera-target sink. The editor's camera-controls store applies the
   * target with whatever animation curve it prefers.
   */
  onNavigate(target: CameraTarget, viewpoint: BCFViewpoint, topic: BCFTopic): void;
  /**
   * Optional override for the focus-distance heuristic. Defaults to
   * the navigator's 10 m placeholder.
   */
  readonly targetDistanceM?: number;
}

const PRIORITY_ISSUES = 80; // shown after Parameters / IFC / Constraints, before AI.

export function createBcfPanelContribution(deps: BcfPanelDeps): PanelContribution {
  return {
    id: 'bcf-issues',
    category: 'Issues',
    priority: PRIORITY_ISSUES,
    shouldShow(context: PanelContext): boolean {
      if (!deps.archive) return false;
      const guid = deps.resolveIfcGuid(context.elementId);
      if (!guid) return false;
      return deps.archive.topics.some(t => topicReferencesGuid(t, guid));
    },
    render(container: HTMLElement, context: PanelContext): void {
      const archive = deps.archive;
      if (!archive) return;
      const guid = deps.resolveIfcGuid(context.elementId);
      if (!guid) return;

      const doc = container.ownerDocument;
      const topics = archive.topics.filter(t => topicReferencesGuid(t, guid));

      const fieldset = doc.createElement('fieldset');
      fieldset.className = 'bcf-issues-fieldset';
      const legend = doc.createElement('legend');
      legend.textContent = `BCF Issues (${topics.length})`;
      fieldset.appendChild(legend);

      for (const topic of topics) {
        fieldset.appendChild(renderTopic(doc, topic, deps));
      }
      container.appendChild(fieldset);
    },
    unmount(container: HTMLElement): void {
      // Listeners are bound to the per-button DOM, so removing the parent
      // node detaches them via the standard event-listener / GC contract.
      // We still call replaceChildren() for an explicit zero-state, which
      // makes the visual-regression gate (G19) easier to reason about.
      container.replaceChildren();
    },
  };
}

function topicReferencesGuid(topic: BCFTopic, ifcGuid: string): boolean {
  for (const vp of topic.viewpoints) {
    const c = vp.components;
    if (!c) continue;
    if (c.selection?.some(s => s.ifcGuid === ifcGuid)) return true;
    if (c.visibility?.exceptions.some(s => s.ifcGuid === ifcGuid)) return true;
    if (c.coloring?.some(g => g.components.some(s => s.ifcGuid === ifcGuid))) return true;
  }
  return false;
}

function renderTopic(doc: Document, topic: BCFTopic, deps: BcfPanelDeps): HTMLElement {
  const details = doc.createElement('details');
  details.className = 'bcf-topic';
  details.dataset.topicGuid = topic.guid;
  // Author + status visible at-a-glance.
  const summary = doc.createElement('summary');
  summary.className = 'bcf-topic-summary';
  summary.textContent = `${topic.title} — ${topic.topicStatus}`;
  details.appendChild(summary);

  if (topic.description) {
    const desc = doc.createElement('p');
    desc.className = 'bcf-topic-description';
    desc.textContent = topic.description;
    details.appendChild(desc);
  }

  if (topic.assignedTo || topic.dueDate || topic.stage) {
    const meta = doc.createElement('p');
    meta.className = 'bcf-topic-meta';
    const parts: string[] = [];
    if (topic.assignedTo) parts.push(`Assigned to: ${topic.assignedTo}`);
    if (topic.dueDate) parts.push(`Due: ${topic.dueDate}`);
    if (topic.stage) parts.push(`Stage: ${topic.stage}`);
    meta.textContent = parts.join(' · ');
    details.appendChild(meta);
  }

  if (topic.viewpoints.length > 0) {
    const vpStrip = doc.createElement('div');
    vpStrip.className = 'bcf-vp-strip';
    for (const vp of topic.viewpoints) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'vp-jumper';
      button.dataset.viewpointGuid = vp.guid;
      button.textContent = vp.position
        ? `Go to ${vp.position.cameraType} viewpoint`
        : 'Snapshot only';
      const positionAvailable = vp.position !== null;
      if (!positionAvailable) {
        button.disabled = true;
      } else {
        button.addEventListener('click', () => {
          const target = viewpointToCameraTarget(vp, {
            ...(deps.targetDistanceM !== undefined ? { targetDistance: deps.targetDistanceM } : {}),
          });
          if (target) deps.onNavigate(target, vp, topic);
        });
      }
      vpStrip.appendChild(button);
    }
    details.appendChild(vpStrip);
  }

  return details;
}
