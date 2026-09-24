import { NextRequest, NextResponse } from "next/server";
import {
  getValidXeroAccessToken,
  missingXeroScopes,
  XeroNotConnectedError,
  XeroReconnectRequiredError,
} from "@/lib/xero";

export const dynamic = "force-dynamic";

interface XeroAccount {
  AccountID: string;
  Code?: string;
  Name: string;
  Type: string;
  Class?: string;
  Status: string;
}

// GET /api/xero/accounts — the tenant's live Chart of Accounts, for
// the per-line picker on a purchase order. Fetched fresh on every call
// (no local cache) so account renames in Xero are reflected immediately.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  try {
    const { accessToken, xeroTenantId, scopes } = await getValidXeroAccessToken(tenantId);
    const missing = missingXeroScopes(scopes, ["accounting.settings.read"]);
    if (missing.length) {
      return NextResponse.json({
        error: "Xero is connected, but this connection cannot read the Chart of Accounts. Reconnect Xero in Settings → Integrations to grant accounting.settings.read.",
        code: "missing_scope",
        missing_scopes: missing,
      }, { status: 403 });
    }

    const res = await fetch("https://api.xero.com/api.xro/2.0/Accounts", {
      headers: {
        Authorization:      `Bearer ${accessToken}`,
        "Xero-tenant-id":   xeroTenantId,
        Accept:             "application/json",
      },
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403) {
      const body = await res.text();
      console.error("[xero/accounts] Xero refused accounts:", res.status, body.slice(0, 300));
      return NextResponse.json({
        error: "Xero refused the Chart of Accounts request. Reconnect Xero in Settings → Integrations.",
        code: "xero_forbidden",
      }, { status: 403 });
    }

    if (!res.ok) {
      const body = await res.text();
      console.error("[xero/accounts] fetch failed:", res.status, body.slice(0, 300));
      return NextResponse.json({ error: "Failed to fetch accounts from Xero" }, { status: 502 });
    }

    const json = await res.json() as { Accounts?: XeroAccount[] };
    // Only accounts that make sense on a purchase-order bill line — active
    // expense and direct-cost accounts. Xero's own Class/Type values.
    const accounts = (json.Accounts ?? [])
      .filter(a => {
        const status = (a.Status ?? "").toUpperCase();
        const klass = (a.Class ?? "").toUpperCase();
        const type = (a.Type ?? "").toUpperCase();
        return status === "ACTIVE" && (klass === "EXPENSE" || type === "DIRECTCOSTS" || type === "OVERHEADS" || type === "EXPENSE");
      })
      .map(a => ({ id: a.AccountID, code: a.Code ?? "", name: a.Name, type: a.Type }))
      .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));

    return NextResponse.json({ accounts });
  } catch (err) {
    if (err instanceof XeroNotConnectedError) {
      return NextResponse.json({
        error: "Xero is not connected. Connect it in Settings → Integrations.",
        code: "not_connected",
      }, { status: 409 });
    }
    if (err instanceof XeroReconnectRequiredError) {
      return NextResponse.json({ error: err.message, code: "reconnect_required" }, { status: 409 });
    }
    console.error("[xero/accounts] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
