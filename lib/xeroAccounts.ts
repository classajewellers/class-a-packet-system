export interface XeroAccountOption {
  id: string;
  code: string;
  name: string;
  type?: string;
}

export type XeroAccountsLoad =
  | { status: "loading" }
  | { status: "ready"; accounts: XeroAccountOption[] }
  | { status: "unavailable"; message: string };

export async function loadXeroAccounts(
  headers: HeadersInit
): Promise<Exclude<XeroAccountsLoad, { status: "loading" }>> {
  try {
    const res = await fetch("/api/xero/accounts", { headers });
    const json = await res.json().catch(() => ({} as { error?: unknown; accounts?: unknown }));
    if (res.ok) {
      const accounts = Array.isArray(json.accounts) ? json.accounts as XeroAccountOption[] : [];
      return { status: "ready", accounts };
    }
    const message = typeof json.error === "string" && json.error
      ? json.error
      : "Could not load Xero accounts.";
    return { status: "unavailable", message };
  } catch {
    return { status: "unavailable", message: "Could not load Xero accounts." };
  }
}
