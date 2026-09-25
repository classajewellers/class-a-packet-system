import net from "net";

/**
 * Send a ZPL string to a Zebra printer via raw TCP.
 * Resolves when the data is flushed; rejects on connect/write timeout or error.
 */
export function sendZpl(
  host: string,
  port: number,
  zpl: string,
  connectTimeoutMs = 5000,
  writeTimeoutMs = 10000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    const connectTimer = setTimeout(() => done(new Error(`Connect timeout to ${host}:${port}`)), connectTimeoutMs);

    socket.connect(port, host, () => {
      clearTimeout(connectTimer);

      const writeTimer = setTimeout(() => done(new Error("Write timeout")), writeTimeoutMs);

      socket.write(Buffer.from(zpl, "utf8"), (err) => {
        clearTimeout(writeTimer);
        if (err) done(err);
        else done();
      });
    });

    socket.on("error", (err) => {
      clearTimeout(connectTimer);
      done(err);
    });
  });
}

/**
 * Ask the printer for its head DPI over port 9100.
 * SGD: ! U1 getvar "head.resolution.in_dpi"
 * Returns null if the printer does not answer. Never throws.
 */
export function readHeadDpi(host: string, port: number, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buf = "";
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish(parseHeadDpi(buf)), timeoutMs);

    socket.connect(port, host, () => {
      socket.write('! U1 getvar "head.resolution.in_dpi"\r\n');
    });
    socket.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const dpi = parseHeadDpi(buf);
      if (dpi) finish(dpi);
    });
    socket.on("error", () => finish(null));
  });
}

export function parseHeadDpi(buf: string): number | null {
  const quoted = buf.match(/"(203|300|600)"/);
  if (quoted) return Number(quoted[1]);
  const bare = buf.match(/\b(203|300|600)\b/);
  return bare ? Number(bare[1]) : null;
}
