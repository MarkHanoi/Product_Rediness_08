import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { createApiGatewayApp, attachWsGateway, parseWsPath } from '../src/index.js';
import { InMemoryProjectStore, InMemoryWsEventBus, StubAiInvokePort } from '../src/index.js';
import { InMemoryAiSpendStore } from '@pryzm/ai-spend';
import { InMemoryOverrideStore } from '@pryzm/admin-overrides';
import { buildCatalogWithBuiltins } from '@pryzm/formula-library';

interface WsRig {
  port: number;
  server: Server;
  wsBus: InMemoryWsEventBus;
  close: () => Promise<void>;
}

async function startWsRig(allowQueryToken = false): Promise<WsRig> {
  const wsBus = new InMemoryWsEventBus();
  const projects = new InMemoryProjectStore();
  const aiPort = new StubAiInvokePort({ workflows: [] });
  const formulaCatalog = buildCatalogWithBuiltins();
  formulaCatalog.freeze();
  const { app } = createApiGatewayApp({
    exportPort: projects,
    importPort: projects,
    aiPort,
    spendStore: new InMemoryAiSpendStore(),
    overrideStore: new InMemoryOverrideStore(),
    formulaCatalog,
    wsBus,
  });
  const server = createServer(app);
  const handle = attachWsGateway(server, {
    bus: wsBus,
    allowQueryToken,
    heartbeatMs: 50_000, // long enough that tests never trigger it
    authResolver: (token) => {
      if (token === 'good') return { subject: 'u-1', scopes: ['project:read'] };
      if (token === 'noscope') return { subject: 'u-1', scopes: [] };
      return null;
    },
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('failed to bind');
  return {
    port: addr.port,
    server,
    wsBus,
    close: async () => {
      await handle.close();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    },
  };
}

interface BufferedSocket {
  readonly ws: WebSocket;
  readonly buffer: string[];
  /** Resolves when a message is queued; cleared when consumed. */
  waiter: ((s: string) => void) | null;
}

function openSocket(url: string, token: string | null): Promise<BufferedSocket> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (token !== null && !url.includes('?token=')) headers['authorization'] = `Bearer ${token}`;
    const ws = new WebSocket(url, { headers });
    const sock: BufferedSocket = { ws, buffer: [], waiter: null };
    // Attach the message buffer SYNCHRONOUSLY so we never drop the welcome
    // envelope.  Node EventEmitter does not buffer events; messages emitted
    // before any 'message' listener is attached are lost.
    ws.on('message', (data) => {
      const txt = data.toString('utf8');
      if (sock.waiter) {
        const w = sock.waiter; sock.waiter = null; w(txt);
      } else {
        sock.buffer.push(txt);
      }
    });
    ws.once('open', () => resolve(sock));
    ws.once('error', reject);
    ws.once('unexpected-response', (_req, res) => {
      reject(new Error(`unexpected-response ${res.statusCode}`));
    });
  });
}

function readNextMessage(sock: BufferedSocket, timeoutMs = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (sock.buffer.length > 0) {
      resolve(sock.buffer.shift()!);
      return;
    }
    const timer = setTimeout(() => {
      sock.waiter = null;
      reject(new Error('timeout'));
    }, timeoutMs);
    sock.waiter = (txt) => { clearTimeout(timer); resolve(txt); };
    sock.ws.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

let rig: WsRig | undefined;
afterEach(async () => { if (rig) { await rig.close(); rig = undefined; } });

describe('parseWsPath', () => {
  it('parses /v1/projects/:id/stream', () => {
    expect(parseWsPath('/v1/projects/abc/stream')).toEqual({ projectId: 'abc', kind: 'project.event' });
  });
  it('parses /v1/projects/:id/awareness', () => {
    expect(parseWsPath('/v1/projects/abc/awareness')).toEqual({ projectId: 'abc', kind: 'project.awareness' });
  });
  it('strips query string', () => {
    expect(parseWsPath('/v1/projects/abc/stream?token=x')).toMatchObject({ projectId: 'abc' });
  });
  it('rejects unrelated paths', () => {
    expect(parseWsPath('/v1/health')).toBeNull();
    expect(parseWsPath(undefined)).toBeNull();
  });
});

describe('WS upgrade', () => {
  it('rejects with 401 when no token', async () => {
    rig = await startWsRig();
    await expect(openSocket(`ws://127.0.0.1:${rig.port}/v1/projects/p-1/stream`, null)).rejects.toThrow(/401/);
  });

  it('rejects with 403 when token has no project:read scope', async () => {
    rig = await startWsRig();
    await expect(openSocket(`ws://127.0.0.1:${rig.port}/v1/projects/p-1/stream`, 'noscope')).rejects.toThrow(/403/);
  });

  it('rejects with 404 for unknown path', async () => {
    rig = await startWsRig();
    await expect(openSocket(`ws://127.0.0.1:${rig.port}/v1/something-else`, 'good')).rejects.toThrow(/404/);
  });

  it('opens with valid bearer token + scope', async () => {
    rig = await startWsRig();
    const sock = await openSocket(`ws://127.0.0.1:${rig.port}/v1/projects/p-1/stream`, 'good');
    const welcome = JSON.parse(await readNextMessage(sock));
    expect(welcome).toMatchObject({ kind: 'welcome', channel: 'project.event', projectId: 'p-1' });
    sock.ws.close();
  });

  it('honours ?token=... when allowQueryToken is true', async () => {
    rig = await startWsRig(true);
    const sock = await openSocket(`ws://127.0.0.1:${rig.port}/v1/projects/p-1/stream?token=good`, null);
    const welcome = JSON.parse(await readNextMessage(sock));
    expect(welcome.kind).toBe('welcome');
    sock.ws.close();
  });

  it('forbids ?token=... when allowQueryToken is false', async () => {
    rig = await startWsRig(false);
    await expect(openSocket(`ws://127.0.0.1:${rig.port}/v1/projects/p-1/stream?token=good`, null)).rejects.toThrow(/401/);
  });
});

describe('WS event delivery', () => {
  it('forwards project events published on the bus', async () => {
    rig = await startWsRig();
    const sock = await openSocket(`ws://127.0.0.1:${rig.port}/v1/projects/p-1/stream`, 'good');
    await readNextMessage(sock); // welcome
    rig.wsBus.publish({
      kind: 'project.event',
      projectId: 'p-1',
      seq: 0,
      ts: Date.now(),
      payload: { command: 'CreateWall', wallId: 'w-1' },
    });
    const msg = JSON.parse(await readNextMessage(sock));
    expect(msg).toMatchObject({
      kind: 'project.event',
      projectId: 'p-1',
      seq: 1,
      payload: { command: 'CreateWall', wallId: 'w-1' },
    });
    sock.ws.close();
  });

  it('isolates channels — awareness on project A does not leak to events on project A', async () => {
    rig = await startWsRig();
    const sock = await openSocket(`ws://127.0.0.1:${rig.port}/v1/projects/p-1/stream`, 'good');
    await readNextMessage(sock); // welcome
    rig.wsBus.publish({
      kind: 'project.awareness',
      projectId: 'p-1',
      seq: 0, ts: Date.now(),
      payload: { cursor: { x: 10, y: 20 } },
    });
    // No event should arrive on the project.event channel for awareness
    // payloads — verified by the read timing out.
    await expect(readNextMessage(sock, 200)).rejects.toThrow(/timeout/);
    sock.ws.close();
  });
});

describe('WS inbound message handling', () => {
  it('responds to ping with pong', async () => {
    rig = await startWsRig();
    const sock = await openSocket(`ws://127.0.0.1:${rig.port}/v1/projects/p-1/stream`, 'good');
    await readNextMessage(sock); // welcome
    sock.ws.send(JSON.stringify({ kind: 'ping' }));
    const reply = JSON.parse(await readNextMessage(sock));
    expect(reply.kind).toBe('pong');
    expect(typeof reply.ts).toBe('number');
    sock.ws.close();
  });

  it('echoes invalid_message on malformed JSON', async () => {
    rig = await startWsRig();
    const sock = await openSocket(`ws://127.0.0.1:${rig.port}/v1/projects/p-1/stream`, 'good');
    await readNextMessage(sock); // welcome
    sock.ws.send('not json');
    const reply = JSON.parse(await readNextMessage(sock));
    expect(reply.error).toBe('invalid_message');
    sock.ws.close();
  });
});
