import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { PacketFormData, Packet, SubmitResponse } from "@/lib/types";
import { createPacket } from "@/lib/createPacket";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse<SubmitResponse>> {
  console.log("[submit] Starting order submission");

  let body: { formData: PacketFormData };
  try {
    body = await req.json();
  } catch {
    console.error("[submit] Failed to parse request body");
    return NextResponse.json(
      { packet: null as unknown as Packet, results: {}, errors: { parse: "Invalid request body" } } as unknown as SubmitResponse,
      { status: 400 }
    );
  }

  const { formData } = body;
  console.log("[submit] Packet type:", formData.packet_type, "| Customer:", formData.customer_email);

  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { packet, errors } = await createPacket(formData, tenantId, supabase);

  if (!packet) {
    console.error("[submit] createPacket FAILED:", JSON.stringify(errors));
    const status = errors.reference ? 500 : 500;
    return NextResponse.json(
      { packet: null as unknown as Packet, results: {}, errors } as unknown as SubmitResponse,
      { status }
    );
  }

  console.log("[submit] Insert successful:", packet.id, packet.reference_number);

  return NextResponse.json({
    packet,
    results: { supabase: "success" },
    errors: {},
  });
}
