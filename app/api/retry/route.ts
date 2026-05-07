import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { upsertKlaviyoProfile, fireKlaviyoEvent, sendKlaviyoConfirmationEmail } from "@/lib/klaviyo";
import { sendPodiumSMS } from "@/lib/podium";
import { appendToSheet } from "@/lib/sheets";
import { Packet, RetryPayload, RetryResponse } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse<RetryResponse>> {
  let body: RetryPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { packetId, output } = body;
  if (!packetId || !output) {
    return NextResponse.json({ success: false, error: "Missing packetId or output" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("packets")
    .select()
    .eq("id", packetId)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: "Packet not found" }, { status: 404 });
  }

  const packet = data as Packet;

  try {
    switch (output) {
      case "klaviyo":
        await upsertKlaviyoProfile(packet);
        await fireKlaviyoEvent(packet);
        await supabase.from("packets").update({ klaviyo_synced: true }).eq("id", packetId);
        break;

      case "email":
        await sendKlaviyoConfirmationEmail(packet);
        await supabase.from("packets").update({ email_sent: true }).eq("id", packetId);
        break;

      case "sms":
        await sendPodiumSMS(packet);
        await supabase.from("packets").update({ sms_sent: true }).eq("id", packetId);
        break;

      case "sheets":
        await appendToSheet(packet);
        await supabase.from("packets").update({ sheets_logged: true }).eq("id", packetId);
        break;

      case "label":
        // Label printing is handled client-side; this just marks the flag
        await supabase.from("packets").update({ label_printed: true }).eq("id", packetId);
        break;

      default:
        return NextResponse.json({ success: false, error: "Unknown output type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
