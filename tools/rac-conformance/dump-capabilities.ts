#!/usr/bin/env tsx
import { allChatCapabilities, CHAT_UNAVAILABLE } from '../../packages/ai-host/src/capabilities/ChatCapabilityRegistry.js';
const caps = allChatCapabilities();
console.log(JSON.stringify(caps.map((c: any) => ({
  id: c.id, busCommand: c.busCommand, targets: c.targets, scope: c.scope,
  scopeModes: c.scopeModes ?? null,
  params: c.parameters?.map((p: any) => `${p.name}:${p.valueSource}${p.required ? '!' : '?'}`) ?? [],
  examples: c.examples ?? [],
  proofs: (c.commandProof ? (Array.isArray(c.commandProof) ? c.commandProof : [c.commandProof]) : []).map((p: any) => p.file),
})), null, 1));
console.error('CAPS=' + caps.length + ' UNAVAILABLE=' + Object.keys(CHAT_UNAVAILABLE).length);
