import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

export type BridgeIdentity = {
  installationId: string;
  tenantId: string;
  printerId: string | null;
};

// Never let Next's Data Cache serve a stale result for the auth lookup — a
// cached empty result would reject a valid, active bridge key indefinitely.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input as RequestInfo, { ...(init ?? {}), cache: "no-store" });

/** Validate a bridge Bearer token and return its identity, or null if invalid. */
export async function validateBridgeAuth(
  authHeader: string | null
): Promise<BridgeIdentity | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const apiKey = authHeader.slice(7).trim();
  if (!apiKey) return null;

  const hash = createHash("sha256").update(apiKey).digest("hex");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false }, global: { fetch: noStoreFetch } }
  );

  const { data } = await supabase
    .from("rfid_bridge_installations")
    .select("id, tenant_id, printer_id, is_active")
    .eq("api_key_hash", hash)
    .maybeSingle();

  if (!data || !data.is_active) return null;

  return {
    installationId: data.id,
    tenantId: data.tenant_id,
    printerId: data.printer_id ?? null,
  };
}
