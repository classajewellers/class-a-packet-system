import { getValidXeroAccessToken, missingXeroScopes, XERO_REQUIRED_CONNECTION_SCOPES, XeroReconnectRequiredError } from "@/lib/xero";

export const XERO_BILL_STATUS = "DRAFT" as const;

export interface DraftBillLine {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
}

export interface DraftBillInput {
  contactName: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  reference: string;
  lines: DraftBillLine[];
}

/** The only bill payload Vault sends. Status is fixed to DRAFT. */
export function buildDraftBillPayload(input: DraftBillInput): { Invoices: Record<string, unknown>[] } {
  const invoice: Record<string, unknown> = {
    Type: "ACCPAY",
    Status: XERO_BILL_STATUS,
    Contact: { Name: input.contactName },
    InvoiceNumber: input.invoiceNumber,
    Reference: input.reference,
    LineAmountTypes: "Exclusive",
    LineItems: input.lines.map(line => ({
      Description: line.description,
      Quantity: line.quantity,
      UnitAmount: line.unitAmount,
      AccountCode: line.accountCode,
    })),
  };
  if (input.invoiceDate) invoice.Date = input.invoiceDate;
  if (input.dueDate) invoice.DueDate = input.dueDate;
  return { Invoices: [invoice] };
}

export async function createXeroDraftBill(tenantId: string, input: DraftBillInput): Promise<{ invoiceId: string }> {
  const { accessToken, xeroTenantId, scopes } = await getValidXeroAccessToken(tenantId);
  const missing = missingXeroScopes(scopes, XERO_REQUIRED_CONNECTION_SCOPES);
  if (missing.includes("accounting.invoices")) {
    throw new XeroReconnectRequiredError("Xero is connected without bill access. Reconnect Xero in Settings → Integrations.");
  }

  const payload = buildDraftBillPayload(input);
  const res = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": xeroTenantId,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({})) as {
    Message?: string;
    Elements?: { ValidationErrors?: { Message?: string }[] }[];
    Invoices?: { InvoiceID?: string; Status?: string }[];
  };
  if (!res.ok) {
    const detail = json.Elements?.[0]?.ValidationErrors?.map(item => item.Message).filter(Boolean).join(" ")
      || json.Message
      || `Xero returned ${res.status}`;
    throw new Error(detail);
  }

  const created = json.Invoices?.[0];
  if (!created?.InvoiceID) throw new Error("Xero did not return a draft bill id.");
  if (created.Status && created.Status !== XERO_BILL_STATUS) {
    throw new Error(`Xero created the bill as ${created.Status}. Vault only keeps DRAFT bills. Review it in Xero before using it.`);
  }
  return { invoiceId: created.InvoiceID };
}

export async function attachFileToXeroDraftBill(
  tenantId: string,
  invoiceId: string,
  fileName: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { accessToken, xeroTenantId } = await getValidXeroAccessToken(tenantId);
  const safeName = fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "invoice";
  const res = await fetch(
    `https://api.xero.com/api.xro/2.0/Invoices/${encodeURIComponent(invoiceId)}/Attachments/${encodeURIComponent(safeName)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": xeroTenantId,
        "Content-Type": contentType || "application/octet-stream",
      },
      body: bytes,
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 240) || `Xero attachment failed (${res.status})`);
  }
}
