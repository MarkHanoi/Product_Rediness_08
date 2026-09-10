import { allChatCapabilities } from '../packages/ai-host/src/capabilities/ChatCapabilityRegistry.js';
const rows = allChatCapabilities().map((c: any) => [
  c.id, c.scope, (c.scopeModes ?? ['all']).join('|'), c.busCommand ?? '-', c.destructive === true ? 'D' : '',
].join('\t'));
console.log('COUNT=' + rows.length);
for (const r of rows) console.log(r);
