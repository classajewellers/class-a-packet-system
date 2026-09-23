import { NextRequest, NextResponse } from "next/server";
import { getValidXeroAccessToken, XeroNotConnectedError } from "@/lib/xero";

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
// populating the mapping dropdowns. Fetched fresh on every call (no local
// cache) so account renames in Xero are reflected immediately.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  try {
    const { accessToken, xeroTenantId } = await getValidXeroAccessToken(tenantId);

    const res = await fetch("https://api.xero.com/api.xro/2.0/Accounts", {
      headers: {
        Authorization:      `Bearer ${accessToken}`,
        "Xero-tenant-id":   xeroTenantId,
        Accept:             "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[xero/accounts] fetch failed:", res.status, body.slice(0, 300));
      return NextResponse.json({ error: "Failed to fetch accounts from Xero" }, { status: 502 });
    }

    const json = await res.json() as { Accounts?: XeroAccount[] };
    // Only accounts that make sense on a purchase-order bill line — active,
    // expense-type accounts. Xero's own Class/Type values, not anything
    // Vault invents.
    const accounts = (json.Accounts ?? [])
      .filter(a => a.Status === "ACTIVE" && (a.Class === "EXPENSE" || a.Type === "DIRECTCOSTS" || a.Type === "OVERHEADS" || a.Type === "EXPENSE"))
      .map(a => ({ id: a.AccountID, code: a.Code ?? "", name: a.Name, type: a.Type }))
      .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));

    return NextResponse.json({ accounts });
  } catch (err) {
    if (err instanceof XeroNotConnectedError) {
      return NextResponse.json({ error: "Xero is not connected" }, { status: 409 });
    }
    console.error("[xero/accounts] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
