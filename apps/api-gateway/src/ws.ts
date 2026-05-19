/**
 * @pryzm/api-gateway — WebSocket gateway (S65 work-item 2).
 *
 * Source authority:
 *   - phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S65 work-item 2
 *   - ADR-0041 §F (WS routing decisions)
 *
 * Two read-only channels per project:
 *
 *   /v1/projects/:projectId/stream      — committed project events
 *   /v1/projects/:projectId/awareness   — read-only awareness (cursors, presence)
 *
 * Authentication: Bearer token via `Authorization` header OR
 * `?token=...` query string (the latter is a concession for browser
 * EventSource / WebSocket clients that cannot set arbitrary headers
 * — gated behind `allowQueryToken: true`).
 *
 * Heartbeat: 30 s ping/pong.  Missed pong → close(1011, 'idle').
 *
 * Loud-fail-soft: malformed inbound JSON gets an echo
 * `{error:'invalid_message'}` and the connection stays open.  Inbound
 * messages are NOT forwarded to the bus (read-only by contract);
 * they're acknowledged so client code can use the same socket for
 * round-trip ping-style health checks.
 */

import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { WsEventBus, WsEvent, WsUnsubscribe } from './ports.js';

const HEARTBEAT_MS = 30_000;

/** Path → kind mapping. Returns null if the path isn't a WS gateway route. */
export interface ParsedWsPath {
  readonly projectId: string;
  readonly kind: 'project.event' | 'project.awareness';
}

export function parseWsPath(rawPath: string | undefined): ParsedWsPath | null {
  if (!rawPath) return null;
  // Strip query string (the URL parser is overkill for our two-route surface).
  const qIdx = rawPath.indexOf('?');
  const pathname = qIdx === -1 ? rawPath : rawPath.slice(0, qIdx);
  // /v1/projects/<projectId>/stream OR /v1/projects/<projectId>/awareness
  const m = /^\/v1\/projects\/([a-zA-Z0-9._-]{1,128})\/(stream|awareness)$/.exec(pathname);
  if (!m) return null;
  const kind = m[2] === 'stream' ? ('project.event' as const) : ('project.awareness' as const);
  return { projectId: m[1]!, kind };
}

export interface WsGatewayOptions {
  readonly bus: WsEventBus;
  /** Resolve `Authorization: Bearer ...` (or `?token=`) to a subject + scopes.
   *  Returns null on auth failure → close(1008, 'unauthorized'). */
  readonly authResolver: (token: string | null) => Promise<WsAuthResult | null> | WsAuthResult | null;
  /** Allow `?token=` as a fallback when the upgrade can't carry headers. */
  readonly allowQueryToken?: boolean;
  /** Optional heartbeat override for tests. */
  readonly heartbeatMs?: number;
}

export interface WsAuthResult {
  readonly subject: string;
  readonly scopes: readonly string[];
}

export interface WsGatewayHandle {
  readonly wss: WebSocketServer;
  /** Detach + tear down. */
  close(): Promise<void>;
}

export function attachWsGateway(server: HttpServer, opts: WsGatewayOptions): WsGatewayHandle {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;

  const upgradeHandler = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const parsed = parseWsPath(req.url);
    if (!parsed) {
      writeUpgradeError(socket, 404, 'not_found');
      return;
    }

    const token = extractToken(req, opts.allowQueryToken === true);
    let auth: WsAuthResult | null;
    try {
      auth = await opts.authResolver(token);
    } catch {
      auth = null;
    }
    if (!auth) {
      writeUpgradeError(socket, 401, 'unauthorized');
      return;
    }

    // `project:read` is the minimum scope for either channel.
    if (!auth.scopes.includes('project:read')) {
      writeUpgradeError(socket, 403, 'insufficient_scope');
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      bindClient(ws, parsed, opts.bus, heartbeatMs);
    });
  };

  server.on('upgrade', upgradeHandler);

  return {
    wss,
    close: async () => {
      server.off('upgrade', upgradeHandler);
      for (const client of wss.clients) {
        try { client.close(1001, 'server_shutdown'); } catch { /* swallow */ }
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

function extractToken(req: IncomingMessage, allowQueryToken: boolean): string | null {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string') {
    const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (m) return m[1]!.trim();
  }
  if (!allowQueryToken) return null;
  const url = req.url ?? '';
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return null;
  const params = new URLSearchParams(url.slice(qIdx + 1));
  return params.get('token');
}

function writeUpgradeError(socket: Duplex, status: number, reason: string): void {
  const body = JSON.stringify({ error: reason });
  const statusText = STATUS_TEXT[status] ?? 'Error';
  const lines = [
    `HTTP/1.1 ${status} ${statusText}`,
    'Content-Type: application/json',
    `Content-Length: ${Buffer.byteLength(body)}`,
    'Connection: close',
    '',
    body,
  ];
  try { socket.end(lines.join('\r\n')); } catch { /* swallow */ }
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
};

function bindClient(
  ws: WebSocket,
  parsed: ParsedWsPath,
  bus: WsEventBus,
  heartbeatMs: number,
): void {
  let alive = true;
  let unsubscribe: WsUnsubscribe;

  const listener = (e: WsEvent) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(e)); } catch { /* swallow */ }
  };

  if (parsed.kind === 'project.event') {
    unsubscribe = bus.subscribeProject(parsed.projectId, listener);
  } else {
    unsubscribe = bus.subscribeAwareness(parsed.projectId, listener);
  }

  // Welcome envelope so clients can confirm channel binding.
  try {
    ws.send(
      JSON.stringify({
        kind: 'welcome',
        channel: parsed.kind,
        projectId: parsed.projectId,
        ts: Date.now(),
      }),
    );
  } catch { /* swallow */ }

  // Heartbeat — server-initiated ping; on close → cleanup.
  const ping = setInterval(() => {
    if (!alive) {
      try { ws.terminate(); } catch { /* swallow */ }
      return;
    }
    alive = false;
    try { ws.ping(); } catch { /* swallow */ }
  }, heartbeatMs);

  ws.on('pong', () => { alive = true; });

  ws.on('message', (raw: RawData) => {
    // Read-only by contract — acknowledge or echo error, never forward.
    let txt: string;
    try { txt = raw.toString('utf8'); } catch { txt = ''; }
    if (!txt) return;
    try {
      const parsedMsg = JSON.parse(txt);
      if (parsedMsg && typeof parsedMsg === 'object' && parsedMsg.kind === 'ping') {
        ws.send(JSON.stringify({ kind: 'pong', ts: Date.now() }));
        return;
      }
      ws.send(JSON.stringify({ error: 'unsupported_inbound', echoed: parsedMsg }));
    } catch {
      ws.send(JSON.stringify({ error: 'invalid_message' }));
    }
  });

  const cleanup = () => {
    clearInterval(ping);
    try { unsubscribe(); } catch { /* swallow */ }
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
}
