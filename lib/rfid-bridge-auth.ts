import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

export type BridgeIdentity = {
  installationId: string;
  tenantId: string;
  printerId: string | null;
};

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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
