/**
 * Mintage of fresh IFC `GloballyUniqueId`s during export.
 *
 * The orchestrator accepts a pluggable `GuidProvider` so tests can inject
 * deterministic 22-character GUIDs (via `deterministicUuid` + `globalIdFromUuid`).
 * Production calls fall through to `web-ifc`'s built-in
 * `CreateIFCGloballyUniqueId(modelId)` which already returns the correct
 * 22-char base64 form.
 */

import type { IfcAPI } from 'web-ifc';

export type GuidProvider = (() => string) | undefined;

export function mintGlobalId(api: IfcAPI, modelId: number, provider: GuidProvider): string {
  if (provider) return provider();
  return api.CreateIFCGloballyUniqueId(modelId);
}
