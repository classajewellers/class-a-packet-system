export interface BridgeConfig {
  vaultApiUrl: string;
  bridgeApiKey: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  printer: {
    host: string;
    port: number;
    connectTimeoutMs: number;
    writeTimeoutMs: number;
  };
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface PrintJob {
  id: string;
  piece_id: string;
  printer_id: string;
  rfid_tag_id: string | null;
  zpl_payload: string;
  label_data: Record<string, unknown> | null;
  label_template: string;
  status: "queued" | "claimed" | "printing" | "completed" | "failed" | "cancelled";
  requested_at: string;
}
