/** Zebra Weblink framing. Every printer message is a binary WebSocket frame. */

export const WEBLINK_PROTOCOL = "v1.weblink.zebra.com";

/** ^SX / alerts.add payloads. SDK is the Weblink destination. */
export const CONFIGURE_ALERTS = [
  "RFID ERROR,SDK,Y,Y,,,N",
  "PQ JOB COMPLETED,SDK,Y,Y,,,N",
  "PAPER OUT,SDK,Y,Y,,,N",
  "HEAD OPEN,SDK,Y,Y,,,N",
] as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeBinary(text: string): Uint8Array {
  return encoder.encode(text);
}

export function decodeBinary(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** JSON as a binary frame. Never a WebSocket text frame. */
export function jsonFrame(value: unknown): Uint8Array {
  return encodeBinary(JSON.stringify(value));
}

export function bytesOf(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return hex(new Uint8Array(digest));
}

export async function signBody(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return hex(new Uint8Array(sig));
}

export async function verifyBody(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!secret || !timestamp || !signature) return false;
  const expected = await signBody(secret, timestamp, body);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return false;
  const stamp = Number(timestamp);
  if (!Number.isFinite(stamp)) return false;
  return Math.abs(nowMs - stamp) <= 5 * 60 * 1000;
}

function stringField(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function decodeBase64(b64: string): string {
  const pad = b64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return decoder.decode(bytes);
}

/** Serial from the main-channel discovery JSON, or from discovery_b64 when it is JSON. */
export function serialFromDiscovery(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const direct = stringField(obj, ["unique_id", "serial_number", "serial"]);
  if (direct) return direct;
  if (typeof obj.discovery_b64 !== "string" || !obj.discovery_b64) return null;
  let decoded = "";
  try {
    decoded = decodeBase64(obj.discovery_b64);
  } catch {
    return null;
  }
  try {
    const inner = JSON.parse(decoded) as Record<string, unknown>;
    const nested = stringField(inner, ["unique_id", "serial_number", "serial"]);
    if (nested) return nested;
  } catch {
    const match = decoded.match(/"unique_id"\s*:\s*"([^"]+)"/);
    if (match) return match[1];
  }
  return null;
}

/**
 * The bridge's jewellery ZPL already starts with ^RF. The relay adds a host
 * read-back (^HV) on the raw channel so the read EPC comes back on this socket.
 * The original ^RF line is left in place.
 */
export function withEpcReadback(zpl: string): string {
  const readback = "^RFR,H,2,12,1^FN1^FS\n^HV1,24,\n";
  if (/\^XZ\s*$/.test(zpl)) return zpl.replace(/\^XZ\s*$/, `${readback}^XZ`);
  return `${zpl}\n${readback}`;
}

export function isRawHello(text: string): boolean {
  try {
    const msg = JSON.parse(text) as { channel_name?: string };
    return msg.channel_name === "v1.raw.zebra.com";
  } catch {
    return false;
  }
}
