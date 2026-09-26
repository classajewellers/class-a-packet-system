import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { decodeBinary, jsonFrame, signBody, WEBLINK_PROTOCOL, withEpcReadback } from "../src/protocol.ts";
import { PrinterLink, type Outbound } from "../src/session.ts";

const SERIAL = "D6J123456";
const EPC = "0123456789abcdef01234567";
const ZPL = `^XA\n^RFW,H,2,12,1^FD${EPC}^FS\n^FO24,121^FDTEST^FS\n^XZ`;

class FakePrinter {
  frames: Outbound[] = [];
  link: PrinterLink;

  constructor(link: PrinterLink) {
    this.link = link;
    link.recordHandshake(
      { host: "vault-print-relay.workers.dev", "sec-websocket-protocol": WEBLINK_PROTOCOL },
      WEBLINK_PROTOCOL,
    );
  }

  main(value: unknown) {
    this.take(this.link.receiveMain(jsonFrame(value)));
  }

  raw(value: unknown) {
    this.take(this.link.receiveRaw(typeof value === "string" ? new TextEncoder().encode(value) : jsonFrame(value)));
  }

  private take(outbound: Outbound[]) {
    for (const frame of outbound) {
      assert.ok(frame.bytes instanceof Uint8Array, "outbound must be a binary frame");
      assert.equal(typeof frame.bytes, "object");
      this.frames.push(frame);
    }
  }

  rawZpl(): string[] {
    return this.frames
      .filter((frame) => frame.channel === "raw")
      .map((frame) => decodeBinary(frame.bytes));
  }
}

function discovery(serial = SERIAL) {
  const packet = Buffer.from(JSON.stringify({ unique_id: serial }), "utf8").toString("base64");
  return { discovery_b64: packet };
}

function connect(link = new PrinterLink(SERIAL)) {
  const printer = new FakePrinter(link);
  printer.main(discovery());
  assert.equal(link.serialMismatch(), false);
  assert.equal(link.mainOpen, true);
  printer.raw({ unique_id: SERIAL, channel_name: "v1.raw.zebra.com", channel_id: "2" });
  assert.equal(link.rawOpen, true);
  return printer;
}

test("discovery opens alerts and the raw channel as binary frames", () => {
  const link = new PrinterLink(SERIAL);
  const printer = new FakePrinter(link);
  printer.main(discovery());
  const main = printer.frames.filter((frame) => frame.channel === "main").map((frame) => decodeBinary(frame.bytes));
  assert.ok(main.some((text) => text.includes("RFID ERROR")));
  assert.ok(main.some((text) => text.includes("PQ JOB COMPLETED")));
  assert.ok(main.some((text) => text.includes("PAPER OUT")));
  assert.ok(main.some((text) => text.includes("HEAD OPEN")));
  assert.ok(main.some((text) => text.includes("v1.raw.zebra.com")));
  assert.equal(link.handshake?.subprotocol, WEBLINK_PROTOCOL);
  assert.ok(link.handshake?.frames[0]?.includes("discovery_b64"));
  assert.equal(link.serial, SERIAL);
});

test("a serial that does not match the token opens nothing", () => {
  const link = new PrinterLink(SERIAL);
  const printer = new FakePrinter(link);
  printer.main(discovery("OTHER"));
  assert.equal(printer.frames.length, 0);
  assert.equal(link.serialMismatch(), true);
  assert.equal(link.mainOpen, false);
});

test("raw channel sends the full job with the RFID write and the EPC read-back", () => {
  const link = new PrinterLink(SERIAL);
  const printer = connect(link);
  const submitted = link.submitJob({ job_id: "job-1", printer_id: "printer-1", zpl: ZPL, expect_epc: EPC });
  printer.frames.push(...submitted.outbound);
  const sent = printer.rawZpl();
  assert.equal(sent.length, 1);
  assert.ok(sent[0].includes("^RFW,H,2,12,1"));
  assert.ok(sent[0].includes("^HV1,24,"));
  assert.ok(sent[0].includes(EPC));
  assert.equal(sent[0], withEpcReadback(ZPL));
  printer.raw(`${EPC}\r\n`);
  const [result] = link.takeResults();
  assert.equal(result.status, "printed");
  assert.equal(result.epc, EPC);
  assert.equal(result.attempt, 1);
});

test("RFID void retries the full job once, then reports failure", () => {
  const link = new PrinterLink(SERIAL);
  const printer = connect(link);
  printer.frames.push(...link.submitJob({ job_id: "job-2", printer_id: "printer-1", zpl: ZPL, expect_epc: EPC }).outbound);
  printer.main({
    alert: { unique_id: SERIAL, condition_id: "RFID ERROR", condition_state: "SET", condition: "RFID ERROR" },
  });
  printer.main({
    alert: { unique_id: SERIAL, condition_id: "RFID ERROR", condition_state: "SET", condition: "RFID ERROR" },
  });
  const sent = printer.rawZpl();
  assert.equal(sent.length, 2, "one retry, then stop");
  assert.equal(sent[0], sent[1]);
  assert.ok(sent[1].includes("^RFW"));
  assert.ok(sent[1].includes("^HV1"));
  const [result] = link.takeResults();
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "RFID error");
  assert.equal(result.attempt, 2);
});

test("disconnect and reconnect resends the full job once", () => {
  const link = new PrinterLink(SERIAL);
  const printer = connect(link);
  printer.frames.push(...link.submitJob({ job_id: "job-3", printer_id: "printer-1", zpl: ZPL, expect_epc: EPC }).outbound);
  link.disconnect();
  assert.equal(link.mainOpen, false);
  assert.equal(link.rawOpen, false);
  printer.main(discovery());
  printer.raw({ unique_id: SERIAL, channel_name: "v1.raw.zebra.com", channel_id: "3" });
  printer.raw(`${EPC}\r\n`);
  const sent = printer.rawZpl();
  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]);
  const [result] = link.takeResults();
  assert.equal(result.status, "printed");
  assert.equal(result.attempt, 2);

  const dropped = new PrinterLink(SERIAL);
  const again = connect(dropped);
  again.frames.push(...dropped.submitJob({ job_id: "job-4", printer_id: "printer-1", zpl: ZPL, expect_epc: EPC }).outbound);
  dropped.disconnect();
  dropped.disconnect();
  const failed = dropped.takeResults();
  assert.equal(failed[0].status, "failed");
  assert.equal(failed[0].reason, "printer disconnected");
  assert.equal(again.rawZpl().length, 1);
});

test("relay HMAC matches Node's HMAC-SHA256", async () => {
  const secret = "shared-secret";
  const timestamp = "1700000000000";
  const body = JSON.stringify({ job_id: "job-1", status: "printed", epc: EPC });
  const relay = await signBody(secret, timestamp, body);
  const node = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  assert.equal(relay, node);
});
