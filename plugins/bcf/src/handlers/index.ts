/**
 * BCF handler set (Wave 11 recipe completion).
 *
 * Wraps readBCF / writeBCF from the BCF IO layer into commandBus handlers
 * so BCF can be registered as a compliant L7 plugin.
 *
 * Architecture note: L7 plugins must not import @pryzm/command-bus (L1)
 * directly. We declare a minimal BusLike interface that accepts a simple
 * on(type, fn) registration surface — the host wires the real CommandBus
 * via the plugin-sdk adapter layer.
 *
 * Spec: PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §5 (S59 BCF round-trip).
 * Recipe status: [S H . . .] — handlers now wired.
 */

import { readBCF } from '../reader.js';
import { writeBCF } from '../writer.js';
import { viewpointToCameraTarget } from '../viewpoint-navigator.js';
import { BCF_COMMANDS } from '../intent.js';
import type { BCFImportPayload, BCFExportPayload, BCFViewpointNavigatePayload } from '../intent.js';
import type { BCFArchive } from '../types.js';

export type { BCFCommandId } from '../intent.js';
export { BCF_COMMANDS };

/**
 * Minimal command-bus surface required by this plugin.
 * L7 plugins bind via @pryzm/plugin-sdk once it ships (Wave 20);
 * until then the host passes any object that satisfies this interface.
 */
export interface BusLike {
  on(type: string, handler: (payload: unknown) => Promise<unknown>): void;
}

export interface BCFHandlerDeps {
  /** Called when a BCF archive is successfully imported. Host stores the archive. */
  onImport?(archive: BCFArchive): void;
  /** Returns the current in-memory BCF archive to export. */
  getArchive?(): BCFArchive | null;
  /** Camera navigation sink. */
  onNavigate?(target: ReturnType<typeof viewpointToCameraTarget>): void;
}

export const BCF_HANDLER_TYPES = [
  BCF_COMMANDS.IMPORT,
  BCF_COMMANDS.EXPORT,
  BCF_COMMANDS.VIEWPOINT_NAVIGATE,
] as const;

export type BCFHandlerType = typeof BCF_HANDLER_TYPES[number];

export function registerBCFHandlers(bus: BusLike, deps: BCFHandlerDeps = {}): void {
  bus.on(BCF_COMMANDS.IMPORT, async (raw) => {
    const payload = raw as BCFImportPayload;
    const archive = await readBCF(payload.bytes);
    deps.onImport?.(archive);
    return archive;
  });

  bus.on(BCF_COMMANDS.EXPORT, async (raw) => {
    const payload = raw as BCFExportPayload;
    void payload; // filename hint handled by host download layer
    const archive = deps.getArchive?.() ?? null;
    if (!archive) throw new Error('[BCF] No archive loaded — cannot export.');
    const bytes = await writeBCF(archive);
    return bytes;
  });

  bus.on(BCF_COMMANDS.VIEWPOINT_NAVIGATE, async (raw) => {
    const payload = raw as BCFViewpointNavigatePayload;
    const archive = deps.getArchive?.() ?? null;
    if (!archive) return;
    const topic = archive.topics.find(t => t.guid === payload.topicGuid);
    const vp = topic?.viewpoints?.find(v => v.guid === payload.viewpointGuid);
    if (vp) {
      const target = viewpointToCameraTarget(vp);
      deps.onNavigate?.(target);
    }
  });
}
