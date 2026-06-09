import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { sendClaimSlip } from "@/lib/claimSlipSender";
import { Packet } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { packet_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { packet_id } = body;
  if (!packet_id) {
    return NextResponse.json({ error: "packet_id is required" }, { status: 400 });
  }

  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId);

  // Fetch the full packet
  const { data: packet, error: fetchError } = await supabase
    .from("packets")
    .select("*")
    .eq("id", packet_id)
    .single();

  if (fetchError || !packet) {
    console.error("[claim-slip] Packet not found:", fetchError?.message);
    return NextResponse.json(
      { error: fetchError?.message ?? "Packet not found" },
      { status: 404 }
    );
  }

  // Only allow repair and custom_order
  if (packet.packet_type !== "repair" && packet.packet_type !== "custom_order") {
    return NextResponse.json(
      { error: "Claim slips are only available for repairs and custom orders" },
      { status: 400 }
    );
  }

  try {
    const result = await sendClaimSlip(packet as Packet, supabase);
    return NextResponse.json({
      ok: true,
      url: result.url,
      reference: result.reference,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[claim-slip] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
