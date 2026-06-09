import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { Packet, AdminPacketsQuery } from "@/lib/types";
import { formatDateAU, formatCurrency, packetTypeLabel } from "@/lib/formatters";

export const dynamic = "force-dynamic";

function escape(val: string | null | undefined): string {
  if (!val) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(packets: Packet[]): string {
  const headers = [
    "Timestamp",
    "Reference No.",
    "Packet Type",
    "Customer Name",
    "Phone",
    "Email",
    "Articles",
    "Instructions",
    "Total Charges",
    "Deposit",
    "Balance",
    "Due Date",
    "Staff Member",
    "Referral Source",
    "ARMS Entered",
    "Notes",
    "Label Printed",
    "Klaviyo",
    "Email Sent",
    "SMS Sent",
    "Sheets Logged",
  ];

  const rows = packets.map((p) => {
    const customerName = [p.customer_first_name, p.customer_last_name]
      .filter(Boolean)
      .join(" ");
    return [
      escape(p.created_at),
      escape(p.reference_number),
      escape(packetTypeLabel(p.packet_type)),
      escape(customerName),
      escape(p.customer_phone),
      escape(p.customer_email),
      escape(p.articles),
      escape(p.instructions),
      escape(formatCurrency(p.total_charges)),
      escape(formatCurrency(p.deposit)),
      escape(formatCurrency(p.balance)),
      escape(formatDateAU(p.due_date)),
      escape(p.staff_member),
      escape(p.referral_source),
      "", // ARMS Entered
      "", // Notes
      p.label_printed ? "Yes" : "No",
      p.klaviyo_synced ? "Yes" : "No",
      p.email_sent ? "Yes" : "No",
      p.sms_sent ? "Yes" : "No",
      p.sheets_logged ? "Yes" : "No",
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const query: AdminPacketsQuery = {
    search: searchParams.get("search") ?? undefined,
    type: (searchParams.get("type") as AdminPacketsQuery["type"]) ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId);
  let dbQuery = supabase
    .from("packets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10000);

  if (query.search) {
    const s = `%${query.search}%`;
    dbQuery = dbQuery.or(
      `reference_number.ilike.${s},customer_first_name.ilike.${s},customer_last_name.ilike.${s},customer_email.ilike.${s}`
    );
  }
  if (query.type && query.type !== "all") {
    dbQuery = dbQuery.eq("packet_type", query.type);
  }
  if (query.from) dbQuery = dbQuery.gte("created_at", query.from);
  if (query.to) {
    const toDate = new Date(query.to);
    toDate.setDate(toDate.getDate() + 1);
    dbQuery = dbQuery.lt("created_at", toDate.toISOString().split("T")[0]);
  }

  const { data, error } = await dbQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const csv = toCsv((data ?? []) as Packet[]);
  const date = new Date().toISOString().split("T")[0];

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="class-a-packets-${date}.csv"`,
    },
  });
}
