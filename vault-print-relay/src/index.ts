import { WEBLINK_PROTOCOL, bytesOf, isRawHello, sha256Hex, verifyBody } from "./protocol.ts";
import { PrinterLink, type JobRequest, type Outbound } from "./session.ts";

export interface Env {
  PRINTER: DurableObjectNamespace;
  TOKENS: KVNamespace;
  RELAY_HMAC_SECRET: string;
  VAULT_WEBHOOK_URL: string;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectId { toString(): string }
interface DurableObjectStub { fetch(input: Request | string, init?: RequestInit): Promise<Response> }
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

type SocketState = { channel?: "main" | "raw" };

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/jobs") return postJob(request, env);
    if (request.method === "POST" && url.pathname === "/admin/printers") return seedPrinter(request, env);
    if (request.method === "GET" && url.pathname === "/admin/handshake") return readHandshake(request, env);
    const printerMatch = url.pathname.match(/^\/printer\/([^/]+)$/);
    if (printerMatch) return printerSocket(request, env, decodeURIComponent(printerMatch[1]));
    return new Response("not found", { status: 404 });
  },
};

export default worker;

async function authorized(request: Request, env: Env): Promise<{ ok: true; body: string } | { ok: false; response: Response }> {
  const body = request.method === "GET" ? new URL(request.url).searchParams.toString() : await request.text();
  const ok = await verifyBody(
    env.RELAY_HMAC_SECRET ?? "",
    request.headers.get("x-relay-timestamp") ?? "",
    body,
    request.headers.get("x-relay-signature") ?? "",
  );
  if (!ok) return { ok: false, response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) };
  return { ok: true, body };
}

async function postJob(request: Request, env: Env): Promise<Response> {
  const auth = await authorized(request, env);
  if (!auth.ok) return auth.response;
  const job = JSON.parse(auth.body) as JobRequest;
  if (!job?.job_id || !job.printer_id || !job.zpl || !job.expect_epc) {
    return Response.json({ error: "job_id, printer_id, zpl, and expect_epc are required" }, { status: 400 });
  }
  const stub = env.PRINTER.get(env.PRINTER.idFromName(job.printer_id));
  return stub.fetch(new Request("https://do/job", { method: "POST", body: JSON.stringify(job) }));
}

async function seedPrinter(request: Request, env: Env): Promise<Response> {
  const auth = await authorized(request, env);
  if (!auth.ok) return auth.response;
  const body = JSON.parse(auth.body) as { printer_id?: string; token?: string; serial?: string };
  if (!body.printer_id || !body.token || !body.serial) {
    return Response.json({ error: "printer_id, token, and serial are required" }, { status: 400 });
  }
  const hash = await sha256Hex(body.token);
  await env.TOKENS.put(hash, JSON.stringify({ printer_id: body.printer_id, serial: body.serial }));
  const stub = env.PRINTER.get(env.PRINTER.idFromName(body.printer_id));
  await stub.fetch(new Request("https://do/seed", {
    method: "POST",
    body: JSON.stringify({ serial: body.serial }),
  }));
  return Response.json({ ok: true });
}

async function readHandshake(request: Request, env: Env): Promise<Response> {
  const auth = await authorized(request, env);
  if (!auth.ok) return auth.response;
  const printerId = new URL(request.url).searchParams.get("printer_id") ?? "";
  if (!printerId) return Response.json({ error: "printer_id required" }, { status: 400 });
  const stub = env.PRINTER.get(env.PRINTER.idFromName(printerId));
  return stub.fetch(new Request("https://do/handshake"));
}

async function printerSocket(request: Request, env: Env, token: string): Promise<Response> {
  const offered = (request.headers.get("Sec-WebSocket-Protocol") ?? "")
    .split(",")
    .map((part) => part.trim());
  if (!offered.includes(WEBLINK_PROTOCOL)) {
    return new Response("Sec-WebSocket-Protocol v1.weblink.zebra.com is required", { status: 400 });
  }
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("websocket required", { status: 426 });
  }
  const hash = await sha256Hex(token);
  const stored = await env.TOKENS.get(hash);
  if (!stored) return new Response("unknown printer token", { status: 401 });
  const { printer_id: printerId, serial } = JSON.parse(stored) as { printer_id: string; serial: string };
  const headers = new Headers(request.headers);
  headers.set("x-printer-serial", serial);
  headers.set("x-handshake-log", "1");
  const stub = env.PRINTER.get(env.PRINTER.idFromName(printerId));
  return stub.fetch(new Request(request, { headers }));
}

export class PrinterSession {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/seed") {
      const body = await request.json() as { serial?: string };
      await this.save(new PrinterLink(body.serial ?? ""));
      return Response.json({ ok: true });
    }
    if (url.pathname === "/handshake") {
      const saved = await this.state.storage.get<ReturnType<PrinterLink["snapshot"]>>("link");
      return Response.json({ handshake: saved?.handshake ?? null });
    }
    if (url.pathname === "/job") {
      const job = await request.json() as JobRequest;
      const link = await this.load();
      const result = link.submitJob(job);
      if (!result.accepted) return Response.json({ error: result.reason }, { status: 409 });
      this.deliver(link, result.outbound);
      await this.save(link);
      await this.postResults(link);
      return Response.json({ ok: true });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("not found", { status: 404 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({} satisfies SocketState);
    const link = await this.load(request.headers.get("x-printer-serial") ?? undefined);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => { headers[key] = value; });
    link.recordHandshake(headers, request.headers.get("Sec-WebSocket-Protocol"));
    await this.save(link);
    // Workers builds the 101 itself. Content-Length: 0 is set here because
    // Zebra rejects the handshake without it, but the runtime may strip it.
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        "Sec-WebSocket-Protocol": WEBLINK_PROTOCOL,
        "Content-Length": "0",
      },
    } as ResponseInit);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === "string") {
      ws.close(1003, "binary frames only");
      return;
    }
    const bytes = bytesOf(message);
    const link = await this.load();
    const attachment = (ws.deserializeAttachment() ?? {}) as SocketState;
    let channel = attachment.channel;
    if (!channel) {
      channel = isRawHello(new TextDecoder().decode(bytes)) ? "raw" : "main";
      ws.serializeAttachment({ channel });
    }
    const outbound = channel === "raw" ? link.receiveRaw(bytes) : link.receiveMain(bytes);
    if (link.serialMismatch()) {
      ws.close(1008, "serial does not match this token");
      await this.save(link);
      return;
    }
    this.deliver(link, outbound);
    await this.save(link);
    await this.postResults(link);
  }

  async webSocketClose() {
    const link = await this.load();
    link.disconnect();
    await this.save(link);
    await this.postResults(link);
  }

  private async load(serial?: string): Promise<PrinterLink> {
    const saved = await this.state.storage.get<ReturnType<PrinterLink["snapshot"]>>("link");
    if (saved) return PrinterLink.restore(saved);
    return new PrinterLink(serial ?? "");
  }

  private async save(link: PrinterLink) {
    await this.state.storage.put("link", link.snapshot());
  }

  private deliver(link: PrinterLink, outbound: Outbound[]) {
    for (const frame of outbound) {
      const delivered = this.sendBinary(frame.channel, frame.bytes);
      if (!delivered && frame.channel === "raw") link.unsendLast();
    }
  }

  /** Binary frames only. A string would be a text frame, which the printer closes. */
  private sendBinary(channel: "main" | "raw", bytes: Uint8Array): boolean {
    const sockets = this.state.getWebSockets();
    const target = sockets.find((ws) => (ws.deserializeAttachment() as SocketState | null)?.channel === channel);
    if (!target) return false;
    target.send(bytes);
    return true;
  }

  private async postResults(link: PrinterLink) {
    const results = link.takeResults();
    if (results.length === 0 || !this.env.VAULT_WEBHOOK_URL) return;
    await this.save(link);
    for (const result of results) {
      const body = JSON.stringify(result);
      const timestamp = String(Date.now());
      const { signBody } = await import("./protocol.ts");
      const signature = await signBody(this.env.RELAY_HMAC_SECRET ?? "", timestamp, body);
      await fetch(this.env.VAULT_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-relay-timestamp": timestamp,
          "x-relay-signature": signature,
        },
        body,
      }).catch(() => undefined);
    }
  }
}

interface DurableObjectState {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
  };
  acceptWebSocket(ws: WebSocket): void;
  getWebSockets(): WebSocket[];
}

interface WebSocket {
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

declare const WebSocketPair: { new (): [WebSocket, WebSocket] };
