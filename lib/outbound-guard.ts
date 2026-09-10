/**
 * outbound-guard.ts
 * Two independent layers of protection for outbound integrations during the
 * Opsys penetration test.
 *
 * ── LAYER 1: global kill switch (env PENTEST_KILL_SWITCH) ─────────────────────
 * For the two channels where a mistake is IRREVERSIBLE — a real Stripe charge or
 * a real SMS to a real customer — a real send must be impossible no matter what
 * during the test window. When PENTEST_KILL_SWITCH is truthy, ALL "stripe" and
 * "sms" sends are blocked for EVERY tenant, including Class A, an unknown tenant,
 * or any attempt to bypass tenant-scoping (null/garbage tenant). It does NOT
 * depend on tenant id at all. Off by default → normal days are unaffected.
 *
 * This is deliberately scoped to ONLY those two channels: a forgotten kill switch
 * can, at worst, delay a real SMS or charge (recoverable — resend), never allow a
 * pentester to reach a real customer. Lower-harm channels (Klaviyo, email) are
 * NOT globally killed — they rely on Layer 2.
 *
 * ── LAYER 2: tenant-scoped suppression (env OPSYS_TEST_TENANT_ID) ─────────────
 * So Opsys sees realistic "this would have sent" behaviour inside THEIR tenant,
 * every channel is stubbed+logged for the specific test tenant. Fail-safe:
 * default is SEND; only the exact configured test tenant is suppressed; the live
 * Class A tenant can never be suppressed even if the env var is misconfigured.
 */

// The live production tenant. Layer 2 can NEVER suppress this tenant.
const CLASS_A_TENANT = "00000000-0000-0000-0000-000000000001";

export type OutboundChannel = "sms" | "stripe" | "klaviyo" | "email";
export type OutboundBlockReason = "kill-switch" | "test-tenant";

// Channels covered by the global kill switch (Layer 1) — the irreversible-harm ones.
const GLOBALLY_KILLABLE: OutboundChannel[] = ["sms", "stripe"];

function killSwitchOn(): boolean {
  const raw = (process.env.PENTEST_KILL_SWITCH ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

/**
 * LAYER 1 — true when the global kill switch is on AND this is one of the two
 * dangerous channels. Tenant-independent by design.
 */
export function isChannelKilled(channel: OutboundChannel): boolean {
  if (!killSwitchOn()) return false;
  return GLOBALLY_KILLABLE.includes(channel);
}

/**
 * LAYER 2 — true only for the configured Opsys test tenant. Fail-safe: false
 * unless OPSYS_TEST_TENANT_ID is set to a non-Class-A tenant id that matches
 * the given tenantId exactly.
 */
export function isOutboundSuppressed(tenantId: string | null | undefined): boolean {
  const testTenant = process.env.OPSYS_TEST_TENANT_ID?.trim();
  if (!testTenant) return false;                    // not configured → never suppress
  if (testTenant === CLASS_A_TENANT) return false;  // refuse to ever suppress the live tenant
  if (typeof tenantId !== "string" || tenantId.length === 0) return false;
  return tenantId === testTenant;                    // suppress ONLY the exact test tenant
}

/**
 * The single decision every outbound send site asks. Returns the reason a send
 * must be stubbed, or null to send normally. Layer 1 (global kill) takes
 * precedence over Layer 2 (tenant scope).
 */
export function outboundBlock(
  channel: OutboundChannel,
  tenantId: string | null | undefined
): OutboundBlockReason | null {
  if (isChannelKilled(channel)) return "kill-switch";
  if (isOutboundSuppressed(tenantId)) return "test-tenant";
  return null;
}

/**
 * Record an outbound send that was stubbed (by either layer), so the pen test
 * can see what WOULD have been sent without anything reaching a real person.
 */
export function logSuppressedOutbound(
  channel: string,
  tenantId: string | null | undefined,
  details: Record<string, unknown> = {},
  reason: OutboundBlockReason = "test-tenant"
): void {
  console.log(
    `[outbound-suppressed] channel=${channel} tenant=${tenantId ?? "unknown"} reason=${reason} — not sent`,
    JSON.stringify(details)
  );
}
