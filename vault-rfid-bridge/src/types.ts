export interface BridgeConfig {
  vaultApiUrl: string;
  bridgeApiKey: string;
  // Optional Vercel Deployment Protection bypass for *.vercel.app practice
  // and branch URLs. Missing or empty disables the header.
  vercelBypassSecret?: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  printer: {
    host: string;
    port: number;
    connectTimeoutMs: number;
    writeTimeoutMs: number;
    // Optional printer web UI (HTTP Basic auth) for auto-verification via the
    // /rfidlog page. If webUser/webPassword are absent, auto-verify is skipped
    // and tags are left for manual UHF verification.
    webUser?: string;
    webPassword?: string;
    webScheme?: "http" | "https";
    webRejectUnauthorized?: boolean;  // false for self-signed printer certs (default)
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
