import {
  CONFIGURE_ALERTS,
  decodeBinary,
  encodeBinary,
  isRawHello,
  jsonFrame,
  serialFromDiscovery,
  withEpcReadback,
} from "./protocol.ts";

export type JobRequest = {
  job_id: string;
  printer_id: string;
  zpl: string;
  expect_epc: string;
};

export type JobResult = {
  job_id: string;
  printer_id: string;
  status: "printed" | "failed";
  epc?: string;
  reason?: string;
  attempt: number;
};

export type Outbound = { channel: "main" | "raw"; bytes: Uint8Array };

export type HandshakeLog = {
  at: string;
  headers: Record<string, string>;
  subprotocol: string | null;
  frames: string[];
};

/** First send plus one full resend. A third send is not allowed. */
const MAX_ATTEMPTS = 2;

export type LinkSnapshot = {
  expectedSerial: string;
  serial: string | null;
  mainOpen: boolean;
  rawOpen: boolean;
  attempts: number;
  sentThisAttempt: boolean;
  awaitingRetry: boolean;
  job: JobRequest | null;
  handshake: HandshakeLog | null;
  results: JobResult[];
};

/**
 * One printer's Weblink session: main channel discovery, raw channel ZPL,
 * and the one-retry rule. Outbound values are always binary frames.
 */
export class PrinterLink {
  serial: string | null = null;
  mainOpen = false;
  rawOpen = false;
  handshake: HandshakeLog | null = null;
  private attempts = 0;
  private sentThisAttempt = false;
  private awaitingRetry = false;
  private job: JobRequest | null = null;
  private results: JobResult[] = [];
  private expectedSerial: string;
  private now: () => string;

  constructor(expectedSerial: string, now: () => string = () => new Date().toISOString()) {
    this.expectedSerial = expectedSerial;
    this.now = now;
  }

  static restore(saved: LinkSnapshot): PrinterLink {
    const link = new PrinterLink(saved.expectedSerial);
    link.serial = saved.serial;
    link.mainOpen = saved.mainOpen;
    link.rawOpen = saved.rawOpen;
    link.attempts = saved.attempts;
    link.sentThisAttempt = saved.sentThisAttempt;
    link.awaitingRetry = saved.awaitingRetry;
    link.job = saved.job;
    link.handshake = saved.handshake;
    link.results = saved.results ?? [];
    return link;
  }

  snapshot(): LinkSnapshot {
    return {
      expectedSerial: this.expectedSerial,
      serial: this.serial,
      mainOpen: this.mainOpen,
      rawOpen: this.rawOpen,
      attempts: this.attempts,
      sentThisAttempt: this.sentThisAttempt,
      awaitingRetry: this.awaitingRetry,
      job: this.job,
      handshake: this.handshake,
      results: this.results,
    };
  }

  recordHandshake(headers: Record<string, string>, subprotocol: string | null) {
    this.handshake = { at: this.now(), headers, subprotocol, frames: [] };
  }

  private noteFrame(bytes: Uint8Array) {
    if (!this.handshake || this.handshake.frames.length >= 8) return;
    this.handshake.frames.push(decodeBinary(bytes).slice(0, 500));
  }

  /** True after discovery when the serial is not the one seeded for this token. */
  serialMismatch(): boolean {
    return this.serial != null && this.serial !== this.expectedSerial;
  }

  receiveMain(bytes: Uint8Array): Outbound[] {
    this.noteFrame(bytes);
    const text = decodeBinary(bytes);
    let msg: Record<string, unknown> = {};
    try {
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return [];
    }
    if (msg.alert && typeof msg.alert === "object") {
      return this.onAlert(msg.alert as Record<string, unknown>);
    }
    const serial = serialFromDiscovery(text);
    if (!serial) return [];
    this.serial = serial;
    if (serial !== this.expectedSerial) return [];
    this.mainOpen = true;
    const out: Outbound[] = CONFIGURE_ALERTS.map((alert) => ({
      channel: "main" as const,
      bytes: jsonFrame({ configure_alert: alert }),
    }));
    out.push({ channel: "main", bytes: jsonFrame({ open: "v1.raw.zebra.com" }) });
    return out;
  }

  receiveRaw(bytes: Uint8Array): Outbound[] {
    this.noteFrame(bytes);
    const text = decodeBinary(bytes);
    if (isRawHello(text)) {
      this.rawOpen = true;
      return this.sendJobIfReady();
    }
    if (this.job && text.toLowerCase().includes(this.job.expect_epc.toLowerCase())) {
      this.results.push({
        job_id: this.job.job_id,
        printer_id: this.job.printer_id,
        status: "printed",
        epc: this.job.expect_epc.toLowerCase(),
        attempt: this.attempts,
      });
      this.job = null;
      this.sentThisAttempt = false;
    }
    return [];
  }

  submitJob(job: JobRequest): { accepted: boolean; reason?: string; outbound: Outbound[] } {
    if (this.job) return { accepted: false, reason: "a job is already in progress", outbound: [] };
    if (!job.zpl.includes("^RF")) {
      return { accepted: false, reason: "job ZPL has no RFID write", outbound: [] };
    }
    this.job = job;
    this.attempts = 0;
    this.sentThisAttempt = false;
    this.awaitingRetry = false;
    return { accepted: true, outbound: this.sendJobIfReady() };
  }

  /**
   * The raw socket was not there to take the ZPL. Roll the attempt back so
   * the full job is sent when the channel connects.
   */
  unsendLast() {
    if (!this.sentThisAttempt) return;
    this.attempts = Math.max(0, this.attempts - 1);
    this.sentThisAttempt = false;
    this.awaitingRetry = false;
  }

  /** Printer socket dropped. One reconnect may resend the full job; the next drop fails it. */
  disconnect(): void {
    this.mainOpen = false;
    this.rawOpen = false;
    if (!this.job) return;
    if (this.attempts >= MAX_ATTEMPTS || this.awaitingRetry) {
      this.awaitingRetry = false;
      this.fail("printer disconnected", false);
      return;
    }
    this.awaitingRetry = true;
    this.sentThisAttempt = false;
  }

  takeResults(): JobResult[] {
    const out = this.results;
    this.results = [];
    return out;
  }

  private sendJobIfReady(): Outbound[] {
    if (!this.job || !this.rawOpen || this.sentThisAttempt) return [];
    if (this.attempts >= MAX_ATTEMPTS) return [];
    this.attempts += 1;
    this.sentThisAttempt = true;
    this.awaitingRetry = false;
    return [{ channel: "raw", bytes: encodeBinary(withEpcReadback(this.job.zpl)) }];
  }

  private fail(reason: string, retry: boolean): Outbound[] {
    if (!this.job) return [];
    if (retry && this.attempts < MAX_ATTEMPTS) {
      this.sentThisAttempt = false;
      return this.sendJobIfReady();
    }
    this.results.push({
      job_id: this.job.job_id,
      printer_id: this.job.printer_id,
      status: "failed",
      reason,
      attempt: Math.max(this.attempts, 1),
    });
    this.job = null;
    this.sentThisAttempt = false;
    return [];
  }

  private onAlert(alert: Record<string, unknown>): Outbound[] {
    const condition = String(alert.condition_id ?? alert.condition ?? "").toUpperCase();
    const state = String(alert.condition_state ?? "SET").toUpperCase();
    if (state === "CLEAR") return [];
    if (condition.includes("RFID")) return this.fail("RFID error", true);
    if (condition.includes("PAPER OUT")) return this.fail("paper out", false);
    if (condition.includes("HEAD OPEN")) return this.fail("head open", false);
    return [];
  }
}
