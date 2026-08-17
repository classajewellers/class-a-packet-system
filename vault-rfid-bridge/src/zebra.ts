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
